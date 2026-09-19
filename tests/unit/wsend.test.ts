import { describe, it, expect } from "vitest";
import { normalizePhone, buildSendUrl, clipboardScript } from "../../src/commands/wsend.js";

describe("normalizePhone", () => {
  it("converts 05x to 972", () => {
    expect(normalizePhone("0507328808")).toBe("972507328808");
  });
  it("keeps 972 prefix, strips symbols", () => {
    expect(normalizePhone("+972-50-732-8808")).toBe("972507328808");
  });
  it("passes other digits through", () => {
    expect(normalizePhone("14155552671")).toBe("14155552671");
  });
});

describe("buildSendUrl", () => {
  it("builds in-app chat link with encoded text", () => {
    const url = buildSendUrl("0507328808", "hi there שלום");
    expect(url).toBe(
      `https://web.whatsapp.com/send?phone=972507328808&text=${encodeURIComponent("hi there שלום")}`,
    );
  });
  it("omits text param when absent", () => {
    expect(buildSendUrl("0507328808")).toBe(
      "https://web.whatsapp.com/send?phone=972507328808",
    );
  });
});

describe("clipboardScript", () => {
  it("rejects missing files", () => {
    const r = clipboardScript("/tmp/does-not-exist.jpg");
    expect("error" in r && r.error).toMatch(/not found/);
  });
  it("rejects unsupported types", () => {
    const r = clipboardScript("/tmp/x.gif");
    expect("error" in r && r.error).toMatch(/Unsupported/);
  });
});
