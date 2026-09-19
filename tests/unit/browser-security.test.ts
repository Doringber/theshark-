import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("browser security invariants", () => {
  it("does not disable browser security or mask automation", async () => {
    const sources = await Promise.all(
      ["src/browser/session.ts", "src/commands/auth.ts"].map((path) =>
        readFile(resolve(path), "utf-8"),
      ),
    );
    const combined = sources.join("\n");

    expect(combined).not.toContain("AutomationControlled");
    expect(combined).not.toContain("--disable-web-security");
    expect(combined).not.toContain("--disable-features=IsolateOrigins");
    expect(combined).not.toContain("bypassCSP");
    expect(combined).not.toContain("ignoreHTTPSErrors");
    expect(combined).not.toContain('Object.defineProperty(navigator, "webdriver"');
  });
});
