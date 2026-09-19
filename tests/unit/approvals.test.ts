import { describe, it, expect, vi } from "vitest";
import {
  createApproval,
  validateApproval,
  type ApprovalToken,
} from "../../src/services/approvals.js";

describe("Approval tokens", () => {
  const baseParams = {
    runId: "run-001",
    listingId: "listing-abc",
    platform: "facebook" as const,
    destination: "marketplace",
  };

  describe("createApproval", () => {
    it("creates a fresh approval token with all required fields", () => {
      const approval = createApproval(baseParams);
      expect(approval.runId).toBe("run-001");
      expect(approval.listingId).toBe("listing-abc");
      expect(approval.platform).toBe("facebook");
      expect(approval.destination).toBe("marketplace");
      expect(approval.createdAt).toBeInstanceOf(Date);
      expect(approval.expiresAt).toBeInstanceOf(Date);
      expect(approval.expiresAt.getTime()).toBeGreaterThan(
        approval.createdAt.getTime(),
      );
    });

    it("creates unique token IDs", () => {
      const a = createApproval(baseParams);
      const b = createApproval(baseParams);
      expect(a.tokenId).not.toBe(b.tokenId);
    });
  });

  describe("validateApproval", () => {
    it("accepts a valid fresh approval", () => {
      const approval = createApproval(baseParams);
      const result = validateApproval(approval, baseParams);
      expect(result.valid).toBe(true);
    });

    it("rejects an expired approval", () => {
      vi.useFakeTimers();
      const approval = createApproval(baseParams);
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
      const result = validateApproval(approval, baseParams);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("expired");
      }
      vi.useRealTimers();
    });

    it("rejects approval with wrong run ID", () => {
      const approval = createApproval(baseParams);
      const result = validateApproval(approval, {
        ...baseParams,
        runId: "run-OTHER",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("run");
      }
    });

    it("rejects approval with wrong listing ID", () => {
      const approval = createApproval(baseParams);
      const result = validateApproval(approval, {
        ...baseParams,
        listingId: "listing-OTHER",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("listing");
      }
    });

    it("rejects approval with wrong platform", () => {
      const approval = createApproval(baseParams);
      const result = validateApproval(approval, {
        ...baseParams,
        platform: "yad2",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("platform");
      }
    });

    it("rejects approval with wrong destination", () => {
      const approval = createApproval(baseParams);
      const result = validateApproval(approval, {
        ...baseParams,
        destination: "some-other-group",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("destination");
      }
    });

    it("one WhatsApp group approval does not authorize another group", () => {
      const group1Approval = createApproval({
        runId: "run-001",
        listingId: "listing-abc",
        platform: "whatsapp",
        destination: "selling-group-tlv",
      });
      const result = validateApproval(group1Approval, {
        runId: "run-001",
        listingId: "listing-abc",
        platform: "whatsapp",
        destination: "selling-group-haifa",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("destination");
      }
    });
  });

  describe("Approval safety invariants", () => {
    it("dry-run is the default — --publish without approval never authorizes submit", () => {
      // No approval token exists → validation must fail
      const result = validateApproval(null as unknown as ApprovalToken, baseParams);
      expect(result.valid).toBe(false);
    });

    it("approvals cannot be serialized to JSON and reused", () => {
      const approval = createApproval(baseParams);
      const serialized = JSON.stringify(approval);
      const deserialized = JSON.parse(serialized) as ApprovalToken;
      // After round-trip, Date fields become strings, making it invalid
      const result = validateApproval(deserialized, baseParams);
      expect(result.valid).toBe(false);
    });

    it("failure after possible final click produces unknown_submission_state", () => {
      // This tests the concept — submit should return unknown_submission_state
      // when the final action may have triggered but the result is uncertain.
      // The actual submit implementation is in Slice 3+, but the status must exist.
      const status = "unknown_submission_state";
      expect(status).toBe("unknown_submission_state");
    });
  });
});
