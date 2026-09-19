import { z } from "zod";

/** Platform names supported in Phase 1 */
export const PlatformName = z.enum(["facebook", "whatsapp", "yad2"]);
export type PlatformName = z.infer<typeof PlatformName>;

/**
 * HTTPS-only URL validation.
 * Rejects: HTTP, embedded credentials, malformed URLs, localhost (unless test mode).
 */
export function validatePlatformUrl(
  url: string,
  options: { allowLocalhost?: boolean } = {},
): { valid: true; url: URL } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: `Malformed URL: "${url}"` };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: "URLs with embedded credentials are not allowed",
    };
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (isLocalhost && !options.allowLocalhost) {
    return {
      valid: false,
      reason: "Localhost URLs are only allowed in test mode",
    };
  }

  if (isLocalhost && options.allowLocalhost) {
    return { valid: true, url: parsed };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `Only HTTPS URLs are allowed, got "${parsed.protocol}"`,
    };
  }

  return { valid: true, url: parsed };
}

/** Allowed production hosts per platform */
export const ALLOWED_HOSTS: Record<PlatformName, string[]> = {
  facebook: ["www.facebook.com", "m.facebook.com", "facebook.com"],
  whatsapp: ["web.whatsapp.com"],
  yad2: ["www.yad2.co.il", "yad2.co.il"],
};

/**
 * Validate that a URL belongs to the allowed hosts for a given platform.
 * In test mode (allowLocalhost), localhost is always allowed.
 */
export function validateHostForPlatform(
  url: string,
  platform: PlatformName,
  options: { allowLocalhost?: boolean } = {},
): { valid: true; url: URL } | { valid: false; reason: string } {
  const urlResult = validatePlatformUrl(url, options);
  if (!urlResult.valid) return urlResult;

  const { url: parsed } = urlResult;
  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (isLocalhost && options.allowLocalhost) {
    return { valid: true, url: parsed };
  }

  const allowed = ALLOWED_HOSTS[platform];
  if (!allowed.includes(parsed.hostname)) {
    return {
      valid: false,
      reason: `Host "${parsed.hostname}" is not allowed for ${platform}. Allowed: ${allowed.join(", ")}`,
    };
  }

  return { valid: true, url: parsed };
}

/** Single platform configuration */
const PlatformConfigSchema = z.object({
  enabled: z.boolean().default(true),
  url: z.string(),
});

/** Full Shark configuration */
export const SharkConfigSchema = z.object({
  language: z.enum(["he", "en", "both"]).default("he"),
  dryRun: z.boolean().default(true),
  currency: z.literal("NIS").default("NIS"),
  browserProfilePath: z.string().default("~/.shark/browser-profile"),
  platforms: z
    .object({
      facebook: PlatformConfigSchema.default({
        enabled: true,
        url: "https://www.facebook.com",
      }),
      whatsapp: PlatformConfigSchema.default({
        enabled: true,
        url: "https://web.whatsapp.com",
      }),
      yad2: PlatformConfigSchema.default({
        enabled: true,
        url: "https://www.yad2.co.il",
      }),
    })
    .default({
      facebook: { enabled: true, url: "https://www.facebook.com" },
      whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
      yad2: { enabled: true, url: "https://www.yad2.co.il" },
    }),
});
export type SharkConfig = z.infer<typeof SharkConfigSchema>;

/** Safe default configuration — dry-run is always true */
export function getDefaultConfig(): SharkConfig {
  return SharkConfigSchema.parse({});
}

/**
 * Load and validate configuration from a plain object.
 * Enforces dry-run default and validates all platform URLs.
 */
export function loadConfig(
  raw: unknown,
  options: { allowLocalhost?: boolean } = {},
): { valid: true; config: SharkConfig } | { valid: false; errors: string[] } {
  const result = SharkConfigSchema.safeParse(raw);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }

  const config = result.data;
  const errors: string[] = [];

  for (const [name, platformConfig] of Object.entries(config.platforms)) {
    if (!platformConfig.enabled) continue;
    const platform = name as PlatformName;
    const hostResult = validateHostForPlatform(platformConfig.url, platform, options);
    if (!hostResult.valid) {
      errors.push(`platforms.${name}.url: ${hostResult.reason}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, config };
}
