/**
 * Optional LLM copywriter.
 *
 * Scope is deliberately narrow: turn facts the USER already gave (title, price,
 * condition, defects, pickup, city) into a well-written listing description.
 * It may rephrase; it may not add. A fact guard rejects any output that
 * introduces numbers, identifiers or a price that were not in the input.
 *
 * Keys are read from environment variables only, sent solely in the provider's
 * auth header, and never logged, persisted or echoed in errors.
 */

export type LlmProviderName = "openai" | "anthropic" | "gemini" | "codex";

export interface LlmFacts {
  title: string;
  price: number;
  condition?: "new" | "like_new" | "good" | "fair" | "poor";
  location?: string;
  defects?: string;
  pickupDelivery?: string;
  /** Existing user description to polish (optional) */
  description?: string;
  category?: string;
  language: "he" | "en" | "both";
}

export interface LlmOptions {
  provider: LlmProviderName;
  model?: string;
  /** Override endpoint (HTTPS only). For `codex`/OpenAI-compatible gateways. */
  baseUrl?: string;
  timeoutMs?: number;
}

export interface LlmClient {
  provider: LlmProviderName;
  model: string;
  baseUrl: string;
  /** Present only in memory for the request; never serialised. */
  readonly apiKey: string;
}

type Result<T> = ({ ok: true } & T) | { ok: false; reason: string };

const DEFAULTS: Record<
  LlmProviderName,
  { envVars: string[]; baseUrl: string; model: string }
> = {
  openai: {
    envVars: ["OPENAI_API_KEY"],
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  codex: {
    envVars: ["CODEX_API_KEY", "OPENAI_API_KEY"],
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  anthropic: {
    envVars: ["ANTHROPIC_API_KEY"],
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-haiku-latest",
  },
  gemini: {
    envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-2.0-flash",
  },
};

export const LLM_PROVIDERS = Object.keys(DEFAULTS) as LlmProviderName[];

/** Which env var (if any) is set for a provider — for `doctor`. Never returns the value. */
export function llmKeyStatus(provider: LlmProviderName): {
  envVar: string;
  present: boolean;
} {
  const vars = DEFAULTS[provider].envVars;
  const found = vars.find((v) => Boolean(process.env[v]?.trim()));
  return { envVar: found ?? vars[0] ?? "", present: Boolean(found) };
}

export function resolveLlmProvider(options: LlmOptions): Result<{ client: LlmClient }> {
  const def = DEFAULTS[options.provider];
  if (!def)
    return { ok: false, reason: `Unknown LLM provider "${String(options.provider)}"` };

  const { envVar, present } = llmKeyStatus(options.provider);
  if (!present) {
    return {
      ok: false,
      reason: `${options.provider}: set ${def.envVars.join(" or ")} in your environment (Shark never asks for or stores keys)`,
    };
  }
  const baseUrl = (options.baseUrl ?? def.baseUrl).replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "LLM base URL is malformed" };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "LLM base URL must be HTTPS without embedded credentials",
    };
  }
  const apiKey = process.env[envVar] as string;
  const client: LlmClient = {
    provider: options.provider,
    model: options.model ?? def.model,
    baseUrl,
    apiKey,
  };
  // Keep the key out of console.log / JSON.stringify by accident.
  Object.defineProperty(client, "apiKey", { value: apiKey, enumerable: false });
  return { ok: true, client };
}

const CONDITION_LABEL: Record<NonNullable<LlmFacts["condition"]>, string> = {
  new: "new",
  like_new: "like new",
  good: "good",
  fair: "fair",
  poor: "poor / needs repair",
};

export function buildCopyPrompt(facts: LlmFacts): { system: string; user: string } {
  const lang =
    facts.language === "he"
      ? "Hebrew"
      : facts.language === "en"
        ? "English"
        : "Hebrew first, then a short English version";
  const system = [
    "You write short, honest second-hand marketplace listings.",
    `Write in ${lang}. Plain text, no markdown, no emojis, no hashtags, at most 600 characters.`,
    "Use ONLY the facts provided. Do not add, invent or infer any specification, year, size, capacity, brand, accessory, warranty or reason for selling that is not listed.",
    "Do not change the price. Do not mention or invent any serial number, IMEI, ID or account name.",
    "If a fact is missing, leave it out — never fill the gap.",
    "Output only the listing text.",
  ].join(" ");

  const lines = [`Title: ${facts.title}`, `Price: ${facts.price} NIS`];
  if (facts.condition) lines.push(`Condition: ${CONDITION_LABEL[facts.condition]}`);
  if (facts.category) lines.push(`Category: ${facts.category}`);
  if (facts.defects) lines.push(`Known defects: ${facts.defects}`);
  if (facts.location) lines.push(`City: ${facts.location}`);
  if (facts.pickupDelivery) lines.push(`Pickup/delivery: ${facts.pickupDelivery}`);
  if (facts.description) lines.push(`Seller's own notes: ${facts.description}`);
  return { system, user: lines.join("\n") };
}

const MAX_COPY_LENGTH = 2000;
const SERIAL_LIKE =
  /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]+\b/;

/**
 * Fact guard: every number in the generated text must appear in the facts, and
 * nothing that looks like a serial/IMEI may appear at all.
 */
export function guardGeneratedCopy(
  text: string,
  facts: LlmFacts,
): Result<{ text: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "LLM returned empty text" };
  if (trimmed.length > MAX_COPY_LENGTH) {
    return {
      ok: false,
      reason: `LLM returned ${trimmed.length} characters (max ${MAX_COPY_LENGTH})`,
    };
  }
  if (SERIAL_LIKE.test(trimmed)) {
    return { ok: false, reason: "LLM output contains a serial-number-like identifier" };
  }
  const allowedSource = [
    facts.title,
    String(facts.price),
    facts.defects,
    facts.location,
    facts.pickupDelivery,
    facts.description,
    facts.category,
  ]
    .filter(Boolean)
    .join(" ");
  const allowed = new Set(allowedSource.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const found = trimmed.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const invented = [...new Set(found.filter((n) => !allowed.has(n)))];
  if (invented.length > 0) {
    return {
      ok: false,
      reason: `LLM tried to invent facts not in your facts: ${invented.join(", ")}`,
    };
  }
  return { ok: true, text: trimmed };
}

async function callProvider(
  client: LlmClient,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<Result<{ text: string }>> {
  let url: string;
  let headers: Record<string, string> = { "content-type": "application/json" };
  let body: unknown;
  let extract: (json: unknown) => string | undefined;

  switch (client.provider) {
    case "openai":
    case "codex": {
      url = `${client.baseUrl}/chat/completions`;
      headers = { ...headers, authorization: `Bearer ${client.apiKey}` };
      body = {
        model: client.model,
        temperature: 0.4,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      };
      extract = (j: unknown): string | undefined =>
        (j as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
          ?.content;
      break;
    }
    case "anthropic": {
      url = `${client.baseUrl}/v1/messages`;
      headers = {
        ...headers,
        "x-api-key": client.apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model: client.model,
        max_tokens: 600,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      };
      extract = (j: unknown): string | undefined =>
        (j as { content?: { type: string; text?: string }[] }).content?.find(
          (c) => c.type === "text",
        )?.text;
      break;
    }
    case "gemini": {
      url = `${client.baseUrl}/v1beta/models/${client.model}:generateContent`;
      headers = { ...headers, "x-goog-api-key": client.apiKey };
      body = {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      };
      extract = (j: unknown): string | undefined =>
        (
          j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        ).candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("");
      break;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.name : "network error";
    return { ok: false, reason: `${client.provider} request failed (${msg})` };
  }
  if (!res.ok) {
    // Never echo the body: it may contain request details or key fragments.
    return {
      ok: false,
      reason: `${client.provider} responded with HTTP ${res.status}`,
    };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: `${client.provider} returned a non-JSON response` };
  }
  const text = extract(json);
  if (!text) return { ok: false, reason: `${client.provider} returned no text` };
  return { ok: true, text };
}

/**
 * Generate a listing description from user facts. Returns the guarded text or a
 * safe reason. The caller decides what to do on failure (keep the user's text).
 */
export async function writeListingCopy(
  facts: LlmFacts,
  options: LlmOptions,
): Promise<Result<{ text: string; provider: LlmProviderName; model: string }>> {
  const resolved = resolveLlmProvider(options);
  if (!resolved.ok) return resolved;
  const { client } = resolved;
  const prompt = buildCopyPrompt(facts);
  const called = await callProvider(client, prompt, options.timeoutMs ?? 30_000);
  if (!called.ok) return called;
  const guarded = guardGeneratedCopy(called.text, facts);
  if (!guarded.ok) return guarded;
  return {
    ok: true,
    text: guarded.text,
    provider: client.provider,
    model: client.model,
  };
}
