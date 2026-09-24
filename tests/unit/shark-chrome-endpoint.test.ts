import { describe, expect, it } from "vitest";
import { SHARK_CDP_URL, describeAttachFailure } from "../../src/browser/session.js";

describe("shared Shark Chrome endpoint", () => {
  it("does not use Chrome's own default debugging port (9222) — a user's everyday Chrome may own it", () => {
    const url = new URL(SHARK_CDP_URL);
    expect(url.port).not.toBe("9222");
  });

  it("binds to IPv4 loopback explicitly so `localhost` dual-stack cannot route to another Chrome", () => {
    expect(new URL(SHARK_CDP_URL).hostname).toBe("127.0.0.1");
  });
});

describe("describeAttachFailure", () => {
  it("explains a default-profile Chrome (context management refused) instead of a generic CDP error", () => {
    const msg = describeAttachFailure(
      "http://127.0.0.1:9333",
      new Error(
        "Protocol error (Browser.setDownloadBehavior): Browser context management is not supported.",
      ),
    );
    expect(msg).toMatch(/another Chrome/i);
    expect(msg).toMatch(/9333/);
    expect(msg).not.toMatch(/setDownloadBehavior/);
  });

  it("keeps the raw reason for other failures", () => {
    const msg = describeAttachFailure(
      "http://127.0.0.1:9333",
      new Error("ECONNREFUSED"),
    );
    expect(msg).toMatch(/ECONNREFUSED/);
  });
});
