import { describe, it, expect } from "vitest";
import {
  getDefaultConfig,
  loadConfig,
  SharkConfigSchema,
} from "../../src/domain/config.js";

describe("Configuration", () => {
  describe("getDefaultConfig", () => {
    it("sets dryRun to true by default", () => {
      const config = getDefaultConfig();
      expect(config.dryRun).toBe(true);
    });

    it("sets language to Hebrew by default", () => {
      const config = getDefaultConfig();
      expect(config.language).toBe("he");
    });

    it("sets currency to NIS", () => {
      const config = getDefaultConfig();
      expect(config.currency).toBe("NIS");
    });

    it("enables all three platforms by default", () => {
      const config = getDefaultConfig();
      expect(config.platforms.facebook.enabled).toBe(true);
      expect(config.platforms.whatsapp.enabled).toBe(true);
      expect(config.platforms.yad2.enabled).toBe(true);
    });

    it("uses HTTPS URLs for all default platforms", () => {
      const config = getDefaultConfig();
      expect(config.platforms.facebook.url).toMatch(/^https:/);
      expect(config.platforms.whatsapp.url).toMatch(/^https:/);
      expect(config.platforms.yad2.url).toMatch(/^https:/);
    });

    it("sets a default browser profile path", () => {
      const config = getDefaultConfig();
      expect(config.browserProfilePath).toBe("~/.shark/browser-profile");
    });
  });

  describe("loadConfig", () => {
    it("validates and returns a complete config", () => {
      const result = loadConfig({
        language: "he",
        dryRun: true,
        currency: "NIS",
        browserProfilePath: "~/.shark/browser-profile",
        platforms: {
          facebook: { enabled: true, url: "https://www.facebook.com" },
          whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
          yad2: { enabled: true, url: "https://www.yad2.co.il" },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("rejects a platform with an HTTP URL", () => {
      const result = loadConfig({
        platforms: {
          facebook: { enabled: true, url: "http://www.facebook.com" },
          whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
          yad2: { enabled: true, url: "https://www.yad2.co.il" },
        },
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("HTTPS"))).toBe(true);
      }
    });

    it("rejects a platform with an unexpected host", () => {
      const result = loadConfig({
        platforms: {
          facebook: { enabled: true, url: "https://evil.com" },
          whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
          yad2: { enabled: true, url: "https://www.yad2.co.il" },
        },
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.includes("not allowed"))).toBe(true);
      }
    });

    it("skips URL validation for disabled platforms", () => {
      const result = loadConfig({
        platforms: {
          facebook: { enabled: false, url: "http://nope" },
          whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
          yad2: { enabled: true, url: "https://www.yad2.co.il" },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("allows localhost URLs in test mode", () => {
      const result = loadConfig(
        {
          platforms: {
            facebook: { enabled: true, url: "http://localhost:4173" },
            whatsapp: { enabled: true, url: "http://localhost:4173" },
            yad2: { enabled: true, url: "http://localhost:4173" },
          },
        },
        { allowLocalhost: true },
      );
      expect(result.valid).toBe(true);
    });

    it("rejects localhost URLs outside test mode", () => {
      const result = loadConfig({
        platforms: {
          facebook: { enabled: true, url: "http://localhost:4173" },
          whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
          yad2: { enabled: true, url: "https://www.yad2.co.il" },
        },
      });
      expect(result.valid).toBe(false);
    });

    it("returns Zod validation errors for invalid schema", () => {
      const result = loadConfig({ language: "klingon" });
      expect(result.valid).toBe(false);
    });

    it("applies defaults for missing fields", () => {
      const result = loadConfig({});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.config.dryRun).toBe(true);
        expect(result.config.language).toBe("he");
      }
    });
  });

  describe("SharkConfigSchema safe defaults", () => {
    it("dryRun defaults to true even when not specified", () => {
      const config = SharkConfigSchema.parse({});
      expect(config.dryRun).toBe(true);
    });

    it("cannot be parsed with dryRun as a non-boolean", () => {
      expect(() => SharkConfigSchema.parse({ dryRun: "false" })).toThrow();
    });
  });
});
