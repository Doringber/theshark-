import { describe, it, expect } from "vitest";
import { validateHostForPlatform } from "../../src/domain/config.js";

describe("Safe navigation (unit)", () => {
  it("allows navigation to valid facebook host", () => {
    const result = validateHostForPlatform(
      "https://www.facebook.com/marketplace",
      "facebook",
    );
    expect(result.valid).toBe(true);
  });

  it("blocks navigation to unexpected host", () => {
    const result = validateHostForPlatform("https://evil.com/phishing", "facebook");
    expect(result.valid).toBe(false);
  });

  it("allows localhost for fixtures in test mode", () => {
    const result = validateHostForPlatform(
      "http://localhost:4173/facebook/index.html",
      "facebook",
      { allowLocalhost: true },
    );
    expect(result.valid).toBe(true);
  });

  it("blocks localhost outside test mode", () => {
    const result = validateHostForPlatform(
      "http://localhost:4173/facebook/index.html",
      "facebook",
    );
    expect(result.valid).toBe(false);
  });
});
