import { describe, it, expect } from "vitest";
import {
  pageUrlMatchesPlatform,
  platformReuseNeedles,
} from "../../src/browser/page-identity.js";

describe("platform tab matching", () => {
  it("matches live hosts and local fixture paths", () => {
    expect(
      pageUrlMatchesPlatform(
        "https://www.yad2.co.il/publish-ad-products/create",
        "yad2",
      ),
    ).toBe(true);
    expect(
      pageUrlMatchesPlatform("http://127.0.0.1:4173/yad2/captcha.html", "yad2"),
    ).toBe(true);
    expect(
      pageUrlMatchesPlatform("http://127.0.0.1:4173/facebook/index.html", "facebook"),
    ).toBe(true);
    expect(pageUrlMatchesPlatform("https://web.whatsapp.com/", "whatsapp")).toBe(true);
    expect(
      pageUrlMatchesPlatform("http://127.0.0.1:4173/facebook/index.html", "yad2"),
    ).toBe(false);
    expect(pageUrlMatchesPlatform("", "yad2")).toBe(false);
  });

  it("reuses both the live host and the fixture path prefix", () => {
    expect(platformReuseNeedles("yad2")).toEqual(["yad2.co.il", "/yad2/"]);
  });
});
