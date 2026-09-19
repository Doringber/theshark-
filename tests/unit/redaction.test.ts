import { describe, it, expect } from "vitest";
import { redact, redactUrl } from "../../src/services/redaction.js";

describe("Redaction", () => {
  describe("redact", () => {
    it("redacts bearer tokens", () => {
      const input = "Authorization: Bearer FAKE_TOKEN_FOR_UNIT_TEST";
      const result = redact(input);
      expect(result).not.toContain("FAKE_TOKEN_FOR_UNIT_TEST");
      expect(result).toContain("[REDACTED");
    });

    it("redacts cookie values", () => {
      const input = "Set-Cookie: session=abc123def456; Path=/; HttpOnly";
      const result = redact(input);
      expect(result).not.toContain("abc123def456");
    });

    it("redacts API keys", () => {
      const input = "OPENAI_API_KEY=sk-fake-test-key-not-real-000";
      const result = redact(input);
      expect(result).not.toContain("sk-fake-test-key-not-real-000");
    });

    it("redacts passwords", () => {
      const input = 'password: "FAKE_TEST_PASS_000"';
      const result = redact(input);
      expect(result).not.toContain("FAKE_TEST_PASS_000");
    });

    it("redacts email addresses", () => {
      const input = "Contact: user@example.com for details";
      const result = redact(input);
      expect(result).not.toContain("user@example.com");
    });

    it("redacts phone numbers (Israeli format)", () => {
      const input = "Call me at 054-1234567 or 052-9876543";
      const result = redact(input);
      expect(result).not.toContain("054-1234567");
      expect(result).not.toContain("052-9876543");
    });

    it("redacts Israeli ID numbers (9 digits)", () => {
      const input = "ID: 123456789";
      const result = redact(input);
      expect(result).not.toContain("123456789");
    });

    it("redacts serial numbers (tagged)", () => {
      const input = "Serial: ABC123DEF456GHI";
      const result = redact(input);
      expect(result).not.toContain("ABC123DEF456GHI");
    });

    it("redacts IMEI values", () => {
      const input = "IMEI: 354234567890123";
      const result = redact(input);
      expect(result).not.toContain("354234567890123");
    });

    it("redacts browser storage values", () => {
      const input =
        'localStorage.setItem("token", "fake-test-val-000")';
      const result = redact(input);
      expect(result).not.toContain("fake-test-val-000");
    });

    it("redacts private chat content patterns", () => {
      const input = "Chat message: Hey, here is my address 123 Main St";
      const result = redact(input);
      // Chat content should not be logged
      expect(result).toContain("[REDACTED");
    });

    it("preserves non-sensitive content", () => {
      const input = "Listing created for MacBook Air at price 2500 NIS";
      const result = redact(input);
      expect(result).toBe(input);
    });

    it("handles empty strings", () => {
      expect(redact("")).toBe("");
    });

    it("handles multiple sensitive values in one string", () => {
      const input =
        "Token: Bearer FAKETEST | Cookie: sess=FAKETEST | Email: a@b.com";
      const result = redact(input);
      expect(result).not.toContain("FAKETEST");
      expect(result).not.toContain("a@b.com");
    });
  });

  describe("redactUrl", () => {
    it("removes query parameters from URLs", () => {
      const input = "https://www.facebook.com/page?token=abc&session=xyz";
      const result = redactUrl(input);
      expect(result).not.toContain("token=abc");
      expect(result).not.toContain("session=xyz");
      expect(result).toContain("facebook.com");
    });

    it("preserves the base URL without query params", () => {
      const input = "https://www.facebook.com/marketplace";
      const result = redactUrl(input);
      expect(result).toBe(input);
    });

    it("removes hash fragments that might contain tokens", () => {
      const input = "https://example.com/callback#access_token=abc123";
      const result = redactUrl(input);
      expect(result).not.toContain("access_token=abc123");
    });

    it("handles malformed URLs gracefully", () => {
      const input = "not-a-url";
      const result = redactUrl(input);
      expect(result).toContain("[REDACTED");
    });
  });

  describe("Image-derived identifier redaction", () => {
    it("does not persist device serial numbers from images", () => {
      const input = "Observed serial number: C02X1234ABCD from image";
      const result = redact(input);
      expect(result).not.toContain("C02X1234ABCD");
    });

    it("does not persist IMEI from images", () => {
      const input = "Image shows IMEI 354234567890123";
      const result = redact(input);
      expect(result).not.toContain("354234567890123");
    });

    it("does not persist account names from images", () => {
      const input = "Account: john.doe@icloud.com visible in screenshot";
      const result = redact(input);
      expect(result).not.toContain("john.doe@icloud.com");
    });
  });

  describe("Request header redaction", () => {
    it("redacts authorization headers", () => {
      const input = "Authorization: Basic FAKE_BASIC_FOR_TEST";
      const result = redact(input);
      expect(result).not.toContain("FAKE_BASIC_FOR_TEST");
    });

    it("redacts x-api-key headers", () => {
      const input = "X-API-Key: fake-test-api-key-000";
      const result = redact(input);
      expect(result).not.toContain("fake-test-api-key-000");
    });
  });
});
