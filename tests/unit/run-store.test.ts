import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RunStore,
  type RunRecord,
  type RunStatus,
  RUN_STATUS_TRANSITIONS,
} from "../../src/services/run-store.js";

describe("Run store", () => {
  let storePath: string;
  let store: RunStore;

  beforeEach(async () => {
    storePath = await mkdtemp(join(tmpdir(), "shark-test-"));
    store = new RunStore(storePath);
  });

  describe("Run creation and retrieval", () => {
    it("creates a run with a generated ID and drafted status", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook", "yad2"],
      });
      expect(run.id).toBeDefined();
      expect(run.status).toBe("drafted");
      expect(run.listingId).toBe("listing-abc");
      expect(run.platforms).toEqual(["facebook", "yad2"]);
      expect(run.createdAt).toBeDefined();
    });

    it("retrieves a run by ID", async () => {
      const created = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const retrieved = await store.getRun(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("returns undefined for unknown run ID", async () => {
      const result = await store.getRun("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("Status transitions", () => {
    it("allows transition from drafted to awaiting_login", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const updated = await store.updateStatus(run.id, "awaiting_login");
      expect(updated.status).toBe("awaiting_login");
    });

    it("allows transition from drafted to awaiting_approval", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const updated = await store.updateStatus(run.id, "awaiting_approval");
      expect(updated.status).toBe("awaiting_approval");
    });

    it("allows transition to published from awaiting_approval", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      const updated = await store.updateStatus(run.id, "published");
      expect(updated.status).toBe("published");
    });

    it("allows transition to skipped from any active state", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const updated = await store.updateStatus(run.id, "skipped");
      expect(updated.status).toBe("skipped");
    });

    it("allows transition to failed from any active state", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      const updated = await store.updateStatus(run.id, "failed");
      expect(updated.status).toBe("failed");
    });

    it("rejects transition from published to drafted", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      await store.updateStatus(run.id, "published");
      await expect(store.updateStatus(run.id, "drafted")).rejects.toThrow();
    });

    it("rejects transition from failed to published", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "failed");
      await expect(store.updateStatus(run.id, "published")).rejects.toThrow();
    });

    it("supports unknown_submission_state with no automatic retry", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      const updated = await store.updateStatus(run.id, "unknown_submission_state");
      expect(updated.status).toBe("unknown_submission_state");
      // Must not allow retry from unknown state
      await expect(store.updateStatus(run.id, "published")).rejects.toThrow();
    });
  });

  describe("Cancellation", () => {
    it("supports cancellation from drafted", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const cancelled = await store.updateStatus(run.id, "cancelled");
      expect(cancelled.status).toBe("cancelled");
    });

    it("supports cancellation from awaiting_approval", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      const cancelled = await store.updateStatus(run.id, "cancelled");
      expect(cancelled.status).toBe("cancelled");
    });

    it("rejects cancellation from published (terminal state)", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      await store.updateStatus(run.id, "awaiting_approval");
      await store.updateStatus(run.id, "published");
      await expect(store.updateStatus(run.id, "cancelled")).rejects.toThrow();
    });
  });

  describe("Destination tracking", () => {
    it("tracks per-destination status", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook", "whatsapp"],
      });
      await store.updateDestinationStatus(
        run.id,
        "facebook",
        "marketplace",
        "published",
      );
      await store.updateDestinationStatus(run.id, "whatsapp", "group-tlv", "skipped");
      const updated = await store.getRun(run.id);
      expect(updated?.destinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            platform: "facebook",
            destination: "marketplace",
            status: "published",
          }),
          expect.objectContaining({
            platform: "whatsapp",
            destination: "group-tlv",
            status: "skipped",
          }),
        ]),
      );
    });
  });

  describe("Persistence", () => {
    it("stores run records as JSON files", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const filePath = join(storePath, `${run.id}.json`);
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as RunRecord;
      expect(parsed.id).toBe(run.id);
      expect(parsed.listingId).toBe("listing-abc");
    });

    it("does not include cookies, tokens, or passwords in stored records", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const filePath = join(storePath, `${run.id}.json`);
      const raw = await readFile(filePath, "utf-8");
      const lowerRaw = raw.toLowerCase();
      expect(lowerRaw).not.toContain("cookie");
      expect(lowerRaw).not.toContain("token");
      expect(lowerRaw).not.toContain("password");
      expect(lowerRaw).not.toContain("secret");
    });

    it("contains only approved listing fields, destinations, timestamps, statuses", async () => {
      const run = await store.createRun({
        listingId: "listing-abc",
        platforms: ["facebook"],
      });
      const filePath = join(storePath, `${run.id}.json`);
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as RunRecord;
      const allowedKeys = [
        "id",
        "listingId",
        "platforms",
        "status",
        "destinations",
        "createdAt",
        "updatedAt",
      ];
      for (const key of Object.keys(parsed)) {
        expect(allowedKeys).toContain(key);
      }
    });
  });

  describe("Status transition map", () => {
    it("defines allowed transitions for all statuses", () => {
      const allStatuses: RunStatus[] = [
        "drafted",
        "awaiting_login",
        "awaiting_approval",
        "published",
        "skipped",
        "failed",
        "cancelled",
        "unknown_submission_state",
      ];
      for (const status of allStatuses) {
        expect(RUN_STATUS_TRANSITIONS).toHaveProperty(status);
      }
    });

    it("terminal states have no outgoing transitions", () => {
      const terminalStatuses: RunStatus[] = [
        "published",
        "failed",
        "cancelled",
        "unknown_submission_state",
      ];
      for (const status of terminalStatuses) {
        expect(RUN_STATUS_TRANSITIONS[status]).toEqual([]);
      }
    });
  });
});
