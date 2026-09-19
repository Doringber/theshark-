import { describe, it, expect } from "vitest";
import { matchChallenge } from "../../src/browser/challenge-detector.js";

describe("challenge matcher", () => {
  it("detects Yad2 hCaptcha copy", () => {
    const result = matchChallenge({
      url: "https://www.yad2.co.il/publish-ad-products/create",
      visibleText: "Are you for real?",
      iframeSrcs: ["https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html"],
      ariaLabels: [],
      testIds: [],
    });
    expect(result.present).toBe(true);
    expect(result.kind).toBe("hcaptcha");
  });

  it("detects reCAPTCHA iframes", () => {
    const result = matchChallenge({
      url: "https://www.facebook.com/marketplace/create/item",
      visibleText: "",
      iframeSrcs: ["https://www.google.com/recaptcha/api2/anchor"],
      ariaLabels: [],
      testIds: [],
    });
    expect(result.present).toBe(true);
    expect(result.kind).toBe("recaptcha");
  });

  it("detects a Cloudflare challenge", () => {
    const result = matchChallenge({
      url: "https://www.yad2.co.il/cdn-cgi/challenge-platform",
      visibleText: "Verify you are human",
      iframeSrcs: [],
      ariaLabels: ["Cloudflare security challenge"],
      testIds: [],
    });
    expect(result.present).toBe(true);
    expect(result.kind).toBe("cloudflare");
  });

  it("detects a generic security checkpoint", () => {
    const result = matchChallenge({
      url: "https://www.facebook.com/checkpoint/",
      visibleText: "Help us confirm it's you",
      iframeSrcs: [],
      ariaLabels: ["Security check"],
      testIds: ["captcha"],
    });
    expect(result.present).toBe(true);
    expect(result.kind).toBe("security_checkpoint");
  });

  it("returns no challenge on a ready Yad2 form", () => {
    const result = matchChallenge({
      url: "https://www.yad2.co.il/publish-ad-products/create",
      visibleText: "כותרת סוג המוצר תיאור מחיר",
      iframeSrcs: [],
      ariaLabels: [],
      testIds: ["text-field-title"],
    });
    expect(result.present).toBe(false);
    expect(result.kind).toBeUndefined();
  });
});
