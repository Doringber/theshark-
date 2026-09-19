import { describe, it, expect } from "vitest";
import {
  validatePlatformUrl,
  validateHostForPlatform,
  ALLOWED_HOSTS,
} from "../../src/domain/config.js";

describe("URL safety", () => {
  describe("validatePlatformUrl", () => {
    it("accepts valid HTTPS URLs", () => {
      const result = validatePlatformUrl("https://www.facebook.com");
      expect(result.valid).toBe(true);
    });

    it("rejects HTTP URLs", () => {
      const result = validatePlatformUrl("http://www.facebook.com");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("HTTPS");
      }
    });

    it("rejects URLs with embedded credentials", () => {
      const result = validatePlatformUrl("https://user:pass@www.facebook.com");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("credentials");
      }
    });

    it("rejects malformed URLs", () => {
      const result = validatePlatformUrl("not-a-url");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("Malformed");
      }
    });

    it("rejects empty strings", () => {
      const result = validatePlatformUrl("");
      expect(result.valid).toBe(false);
    });

    it("rejects localhost by default", () => {
      const result = validatePlatformUrl("http://localhost:3000");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("Localhost");
      }
    });

    it("rejects 127.0.0.1 by default", () => {
      const result = validatePlatformUrl("http://127.0.0.1:3000");
      expect(result.valid).toBe(false);
    });

    it("allows localhost in test mode", () => {
      const result = validatePlatformUrl("http://localhost:4173", {
        allowLocalhost: true,
      });
      expect(result.valid).toBe(true);
    });

    it("allows 127.0.0.1 in test mode", () => {
      const result = validatePlatformUrl("http://127.0.0.1:4173", {
        allowLocalhost: true,
      });
      expect(result.valid).toBe(true);
    });

    it("rejects FTP URLs", () => {
      const result = validatePlatformUrl("ftp://files.example.com");
      expect(result.valid).toBe(false);
    });

    it("rejects javascript: URLs", () => {
      const result = validatePlatformUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateHostForPlatform", () => {
    it("accepts www.facebook.com for facebook", () => {
      const result = validateHostForPlatform(
        "https://www.facebook.com/marketplace",
        "facebook",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts m.facebook.com for facebook", () => {
      const result = validateHostForPlatform("https://m.facebook.com", "facebook");
      expect(result.valid).toBe(true);
    });

    it("rejects evil.com for facebook", () => {
      const result = validateHostForPlatform("https://evil.com", "facebook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("not allowed");
      }
    });

    it("accepts web.whatsapp.com for whatsapp", () => {
      const result = validateHostForPlatform("https://web.whatsapp.com", "whatsapp");
      expect(result.valid).toBe(true);
    });

    it("rejects whatsapp.com for whatsapp (only web. subdomain allowed)", () => {
      const result = validateHostForPlatform("https://whatsapp.com", "whatsapp");
      expect(result.valid).toBe(false);
    });

    it("accepts yad2.co.il for yad2", () => {
      const result = validateHostForPlatform("https://yad2.co.il", "yad2");
      expect(result.valid).toBe(true);
    });

    it("accepts www.yad2.co.il for yad2", () => {
      const result = validateHostForPlatform("https://www.yad2.co.il", "yad2");
      expect(result.valid).toBe(true);
    });

    it("rejects yad2.com (wrong TLD) for yad2", () => {
      const result = validateHostForPlatform("https://yad2.com", "yad2");
      expect(result.valid).toBe(false);
    });

    it("allows localhost for any platform in test mode", () => {
      for (const platform of ["facebook", "whatsapp", "yad2"] as const) {
        const result = validateHostForPlatform("http://localhost:4173", platform, {
          allowLocalhost: true,
        });
        expect(result.valid).toBe(true);
      }
    });

    it("rejects HTTP for non-localhost hosts", () => {
      const result = validateHostForPlatform("http://www.facebook.com", "facebook");
      expect(result.valid).toBe(false);
    });

    it("checks ALLOWED_HOSTS contains expected entries", () => {
      expect(ALLOWED_HOSTS.facebook).toContain("www.facebook.com");
      expect(ALLOWED_HOSTS.whatsapp).toContain("web.whatsapp.com");
      expect(ALLOWED_HOSTS.yad2).toContain("www.yad2.co.il");
    });
  });
});
