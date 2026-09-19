import { describe, it, expect } from "vitest";
import {
  buildContentVersion,
  buildIdempotencyKey,
  shouldSkipAction,
  recordAction,
  type PlatformAction,
} from "../../src/services/idempotency.js";
import type { DestinationRecord } from "../../src/services/run-store.js";

const KEY_PARTS = {
  runId: "run-1",
  listingId: "listing-1",
  platform: "yad2",
  destination: "yad2",
  contentVersion: "v1",
};

function dest(overrides: Partial<DestinationRecord> = {}): DestinationRecord {
  return {
    platform: "yad2",
    destination: "yad2",
    status: "filling_form",
    updatedAt: "2026-09-19T00:00:00.000Z",
    idempotencyKey: buildIdempotencyKey(KEY_PARTS),
    contentVersion: "v1",
    completedActions: [],
    completedSteps: [],
    ...overrides,
  };
}

describe("idempotency", () => {
  it("builds a key from run, listing, platform, destination, and content version", () => {
    const key = buildIdempotencyKey(KEY_PARTS);
    expect(key).toContain("run-1");
    expect(key).toContain("listing-1");
    expect(key).toContain("yad2");
    expect(key).toContain("v1");
    expect(buildIdempotencyKey({ ...KEY_PARTS, contentVersion: "v2" })).not.toBe(key);
  });

  it("changes the content version when approved listing fields change", () => {
    const a = buildContentVersion({
      title: "MacBook",
      description: "works",
      price: 300,
      condition: "good",
      location: "תל אביב",
      imagePaths: ["/a.jpg", "/b.jpg"],
    });
    const b = buildContentVersion({
      title: "MacBook",
      description: "works",
      price: 350,
      condition: "good",
      location: "תל אביב",
      imagePaths: ["/a.jpg", "/b.jpg"],
    });
    expect(a).not.toBe(b);
  });

  it("skips a completed action for the same idempotency key", () => {
    const record = dest({
      completedActions: ["upload_images", "create_draft"],
    });
    const key = record.idempotencyKey ?? "";
    expect(shouldSkipAction(record, "upload_images", key)).toBe(true);
    expect(shouldSkipAction(record, "create_draft", key)).toBe(true);
    expect(shouldSkipAction(record, "publish", key)).toBe(false);
  });

  it("does not skip actions when the content version / key changed", () => {
    const record = dest({
      completedActions: ["upload_images"],
    });
    const otherKey = buildIdempotencyKey({ ...KEY_PARTS, contentVersion: "v2" });
    expect(shouldSkipAction(record, "upload_images", otherKey)).toBe(false);
  });

  it("never retries publish or send when status is unknown_submission_state", () => {
    const record = dest({
      status: "unknown_submission_state",
      completedActions: [],
    });
    const actions: PlatformAction[] = ["publish", "send_message", "create_draft"];
    for (const action of actions) {
      expect(shouldSkipAction(record, action, record.idempotencyKey ?? "")).toBe(true);
    }
  });

  it("never retries a submitted destination", () => {
    const record = dest({
      status: "submitted",
      completedActions: ["publish"],
    });
    const submittedKey = record.idempotencyKey ?? "";
    expect(shouldSkipAction(record, "publish", submittedKey)).toBe(true);
    expect(shouldSkipAction(record, "create_draft", submittedKey)).toBe(true);
  });

  it("records an action without duplicating it", () => {
    const first = recordAction(dest(), "upload_images");
    const second = recordAction(first, "upload_images");
    expect(second.completedActions).toEqual(["upload_images"]);
  });
});
