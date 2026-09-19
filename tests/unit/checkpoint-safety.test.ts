import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "../../src/services/run-store.js";
import { buildContentVersion } from "../../src/services/idempotency.js";

describe("run checkpoint safety", () => {
  let store: RunStore;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shark-checkpoint-"));
    store = new RunStore(dir);
  });

  it("persists a safe listing snapshot and content version", async () => {
    const run = await store.createRun({
      listingId: "listing-1",
      platforms: ["facebook", "yad2"],
    });
    const snapshot = {
      id: "listing-1",
      title: "MacBook Air",
      description: "עובד מצוין",
      price: 300,
      currency: "NIS" as const,
      condition: "good",
      location: "תל אביב",
      language: "he" as const,
      imagePaths: ["/tmp/a.jpg"],
      imageOrder: [0],
      facts: [],
    };
    const version = buildContentVersion({
      title: snapshot.title,
      description: snapshot.description,
      price: snapshot.price,
      condition: snapshot.condition,
      location: snapshot.location,
      imagePaths: snapshot.imagePaths,
    });
    await store.saveSafeListing(run.id, snapshot, version);
    const loaded = await store.getRun(run.id);
    expect(loaded?.listing?.title).toBe("MacBook Air");
    expect(loaded?.contentVersion).toBe(version);
  });

  it("stores a CAPTCHA checkpoint without cookies or challenge tokens", async () => {
    const run = await store.createRun({
      listingId: "listing-1",
      platforms: ["yad2"],
    });
    await store.saveDestinationCheckpoint(run.id, {
      platform: "yad2",
      destination: "yad2",
      status: "awaiting_human_captcha",
      nextStep: "upload_photos",
      completedSteps: ["dismiss_resume_modal"],
      completedActions: [],
      idempotencyKey: "run-1:listing-1:yad2:yad2:v1",
      contentVersion: "v1",
    });
    const raw = await readFile(join(dir, `${run.id}.json`), "utf-8");
    const lower = raw.toLowerCase();
    expect(lower).not.toContain("cookie");
    expect(lower).not.toContain("hcaptcha");
    expect(lower).not.toContain("localstorage");
    expect(lower).not.toContain("sessionstorage");
    expect(lower).not.toContain("password");
    expect(raw).not.toContain("cf_clearance");
    const loaded = await store.getRun(run.id);
    expect(loaded?.destinations[0]?.status).toBe("awaiting_human_captcha");
    expect(loaded?.destinations[0]?.nextStep).toBe("upload_photos");
  });

  it("rejects listing snapshots that include browser secrets", async () => {
    const run = await store.createRun({
      listingId: "listing-1",
      platforms: ["yad2"],
    });
    await expect(
      store.saveSafeListing(
        run.id,
        {
          id: "listing-1",
          title: "x",
          description: "y",
          price: 1,
          currency: "NIS",
          condition: "good",
          location: "TLV",
          language: "he",
          imagePaths: ["/tmp/a.jpg"],
          imageOrder: [0],
          facts: [],
          cookies: "sid=abc",
        } as never,
        "v1",
      ),
    ).rejects.toThrow(/unsafe|forbidden/i);
  });

  it("redacts persisted diagnostic messages", async () => {
    const run = await store.createRun({
      listingId: "listing-1",
      platforms: ["facebook"],
    });

    await store.saveDestinationCheckpoint(run.id, {
      platform: "facebook",
      destination: "marketplace",
      status: "failed",
      reasonCode: "needs_mapping",
      safeMessage:
        "Could not map form. Authorization: Bearer abcdef123456 user@example.com",
    });

    const raw = await readFile(join(dir, `${run.id}.json`), "utf-8");
    expect(raw).toContain("needs_mapping");
    expect(raw).toContain("[REDACTED_TOKEN]");
    expect(raw).toContain("[REDACTED_EMAIL]");
    expect(raw).not.toContain("abcdef123456");
    expect(raw).not.toContain("user@example.com");
  });
});
