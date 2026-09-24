import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCopyPrompt,
  guardGeneratedCopy,
  resolveLlmProvider,
  writeListingCopy,
  type LlmFacts,
} from "../../src/services/llm-copywriter.js";

const facts: LlmFacts = {
  title: "מקבוק אייר 2015 13 אינץ'",
  price: 300,
  condition: "good",
  location: "מודיעין",
  defects: "שריטה קלה במכסה",
  pickupDelivery: "איסוף עצמי",
  language: "he",
};

describe("resolveLlmProvider (keys from env only, never persisted)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it.each([
    ["openai", "OPENAI_API_KEY", "https://api.openai.com/v1"],
    ["anthropic", "ANTHROPIC_API_KEY", "https://api.anthropic.com"],
    ["gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com"],
  ] as const)("%s reads %s", (provider, envVar, baseUrl) => {
    process.env[envVar] = "FAKE_KEY_FOR_UNIT_TEST";
    const r = resolveLlmProvider({ provider });
    expect(r.ok && r.client.provider).toBe(provider);
    expect(r.ok && r.client.baseUrl).toBe(baseUrl);
  });

  it("codex is an OpenAI-compatible endpoint (OPENAI_API_KEY or CODEX_API_KEY)", () => {
    process.env["CODEX_API_KEY"] = "FAKE_KEY_FOR_UNIT_TEST";
    const r = resolveLlmProvider({ provider: "codex" });
    expect(r.ok && r.client.provider).toBe("codex");
  });

  it("fails closed with the env var name when the key is missing — never prompts for a key", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const r = resolveLlmProvider({ provider: "anthropic" });
    expect(!r.ok && r.reason).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("never echoes the key value in errors or client description", () => {
    process.env["OPENAI_API_KEY"] = "sk-FAKE-SECRET-VALUE-123";
    const r = resolveLlmProvider({
      provider: "openai",
      baseUrl: "http://insecure.example",
    });
    expect(!r.ok && r.reason).not.toContain("sk-FAKE-SECRET-VALUE-123");
  });

  it("rejects non-HTTPS base URLs", () => {
    process.env["OPENAI_API_KEY"] = "FAKE_KEY_FOR_UNIT_TEST";
    const r = resolveLlmProvider({
      provider: "openai",
      baseUrl: "http://api.example.com",
    });
    expect(r.ok).toBe(false);
  });
});

describe("buildCopyPrompt", () => {
  it("includes only user facts and forbids inventing new ones", () => {
    const p = buildCopyPrompt(facts);
    expect(p.user).toContain(facts.title);
    expect(p.user).toContain("300");
    expect(p.user).toContain(facts.defects ?? "");
    expect(p.system).toMatch(/do not (add|invent)/i);
    expect(p.system).toMatch(/serial|IMEI/i);
  });

  it("never includes image paths or bytes", () => {
    const p = buildCopyPrompt({
      ...facts,
      imagePaths: ["/Users/me/secret/photo.jpg"],
    } as never);
    expect(p.user + p.system).not.toContain("/Users/me");
  });
});

describe("guardGeneratedCopy (fact guard)", () => {
  it("accepts copy that only restates the given facts", () => {
    const r = guardGeneratedCopy(
      "למכירה מקבוק אייר 2015 13 אינץ' במצב טוב. שריטה קלה במכסה. 300 ש\"ח, איסוף עצמי במודיעין.",
      facts,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects numbers that were not in the facts (e.g. invented specs or year)", () => {
    const r = guardGeneratedCopy('מקבוק אייר 2015 עם 16GB זיכרון, 300 ש"ח', facts);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/16/);
  });

  it("rejects a different price", () => {
    const r = guardGeneratedCopy("מקבוק אייר 2015 13 אינץ' רק 250 ש\"ח", facts);
    expect(r.ok).toBe(false);
  });

  it("rejects serial-number-like identifiers", () => {
    const r = guardGeneratedCopy(
      "מקבוק אייר 2015 13 אינץ', 300 ש\"ח, מספר סידורי C02R1234ABCD",
      facts,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects empty or over-long output", () => {
    expect(guardGeneratedCopy("", facts).ok).toBe(false);
    expect(guardGeneratedCopy("א".repeat(2001), facts).ok).toBe(false);
  });
});

describe("writeListingCopy", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("sends the key only in the auth header and returns guarded copy", async () => {
    process.env["OPENAI_API_KEY"] = "FAKE_KEY_FOR_UNIT_TEST";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "למכירה מקבוק אייר 2015 13 אינץ' במצב טוב, שריטה קלה במכסה. 300 ש\"ח, איסוף עצמי במודיעין.",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const r = await writeListingCopy(facts, { provider: "openai" });
    expect(r.ok).toBe(true);
    const body = String(calls[0]?.init.body);
    expect(body).not.toContain("FAKE_KEY_FOR_UNIT_TEST");
    expect(calls[0]?.url).toMatch(/^https:\/\/api\.openai\.com/);
  });

  it("returns the guard failure instead of invented copy", async () => {
    process.env["GEMINI_API_KEY"] = "FAKE_KEY_FOR_UNIT_TEST";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                { content: { parts: [{ text: 'מקבוק 2019 עם 512GB, 300 ש"ח' }] } },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const r = await writeListingCopy(facts, { provider: "gemini" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/invent|not in your facts/i);
  });

  it("surfaces HTTP errors without the response body being echoed raw", async () => {
    process.env["ANTHROPIC_API_KEY"] = "FAKE_KEY_FOR_UNIT_TEST";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("secret-ish body sk-abc", { status: 401 })),
    );
    const r = await writeListingCopy(facts, { provider: "anthropic" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/401/);
    expect(!r.ok && r.reason).not.toContain("sk-abc");
  });
});
