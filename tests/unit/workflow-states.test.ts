import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STATUSES,
  WORKFLOW_TRANSITIONS,
  canTransition,
  isTerminalStatus,
  isRetryForbidden,
  type WorkflowStatus,
} from "../../src/domain/workflow.js";

describe("workflow states", () => {
  it("defines the required sell-run states", () => {
    expect(WORKFLOW_STATUSES).toEqual([
      "preparing",
      "awaiting_login",
      "awaiting_human_captcha",
      "filling_form",
      "draft_ready",
      "awaiting_final_approval",
      "submitted",
      "unknown_submission_state",
      "skipped",
      "failed",
    ]);
  });

  it("allows an explicit path through CAPTCHA then form fill", () => {
    expect(canTransition("preparing", "awaiting_human_captcha")).toBe(true);
    expect(canTransition("awaiting_human_captcha", "filling_form")).toBe(true);
    expect(canTransition("filling_form", "draft_ready")).toBe(true);
    expect(canTransition("draft_ready", "awaiting_final_approval")).toBe(true);
    expect(canTransition("awaiting_final_approval", "submitted")).toBe(true);
  });

  it("pauses again if CAPTCHA returns during form fill", () => {
    expect(canTransition("filling_form", "awaiting_human_captcha")).toBe(true);
  });

  it("allows login expiry after CAPTCHA without losing the run", () => {
    expect(canTransition("awaiting_human_captcha", "awaiting_login")).toBe(true);
    expect(canTransition("awaiting_login", "filling_form")).toBe(true);
  });

  it("forbids retrying a final action whose result is unknown", () => {
    expect(isRetryForbidden("unknown_submission_state")).toBe(true);
    expect(canTransition("unknown_submission_state", "submitted")).toBe(false);
    expect(canTransition("unknown_submission_state", "awaiting_final_approval")).toBe(
      false,
    );
  });

  it("forbids restarting a submitted platform", () => {
    expect(isRetryForbidden("submitted")).toBe(true);
    expect(canTransition("submitted", "filling_form")).toBe(false);
    expect(canTransition("submitted", "awaiting_final_approval")).toBe(false);
  });

  it("treats submitted, unknown, skipped, and failed as terminal", () => {
    const terminal: WorkflowStatus[] = [
      "submitted",
      "unknown_submission_state",
      "skipped",
      "failed",
    ];
    for (const status of terminal) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(WORKFLOW_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("does not treat awaiting_human_captcha as failed or terminal", () => {
    expect(isTerminalStatus("awaiting_human_captcha")).toBe(false);
    expect(isRetryForbidden("awaiting_human_captcha")).toBe(false);
  });
});
