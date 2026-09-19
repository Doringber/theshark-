import { describe, it, expect } from "vitest";
import { formatRunStatus } from "../../src/services/run-status-view.js";
import type { RunRecord } from "../../src/services/run-store.js";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-abc",
    listingId: "listing-1",
    platforms: ["facebook", "whatsapp", "yad2"],
    status: "awaiting_human_captcha",
    destinations: [
      {
        platform: "facebook",
        destination: "marketplace",
        status: "draft_ready",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
      {
        platform: "whatsapp",
        destination: "Family",
        status: "submitted",
        updatedAt: "2026-09-19T00:00:00.000Z",
        completedActions: ["send_message"],
      },
      {
        platform: "yad2",
        destination: "yad2",
        status: "awaiting_human_captcha",
        updatedAt: "2026-09-19T00:00:00.000Z",
      },
    ],
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("run status view", () => {
  it("prints a concise per-platform status and next action", () => {
    const text = formatRunStatus(run());
    expect(text).toContain("Facebook   draft_ready");
    expect(text).toContain("WhatsApp   submitted to 1 approved group");
    expect(text).toContain("Yad2       awaiting_human_captcha");
    expect(text).toContain("Next action: Complete the Yad2 CAPTCHA in Shark Chrome.");
    expect(text).toContain("run-abc");
  });

  it("tells the user how to resume after a timeout", () => {
    const text = formatRunStatus(
      run({
        destinations: [
          {
            platform: "yad2",
            destination: "yad2",
            status: "awaiting_human_captcha",
            nextStep: "upload_photos",
            updatedAt: "2026-09-19T00:00:00.000Z",
          },
        ],
      }),
      { timedOut: true },
    );
    expect(text).toContain("shark resume run-abc");
  });

  it("requires manual verification for an unknown submission state", () => {
    const text = formatRunStatus(
      run({
        destinations: [
          {
            platform: "facebook",
            destination: "marketplace",
            status: "unknown_submission_state",
            reasonCode: "submission_confirmation_missing",
            safeMessage: "The final result could not be confirmed.",
            updatedAt: "2026-09-19T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(text).toContain("The final result could not be confirmed.");
    expect(text).toContain(
      "Next action: Verify Facebook manually. Shark will not retry this submission.",
    );
  });

  it("shows a safe recovery action for failed mapping", () => {
    const text = formatRunStatus(
      run({
        destinations: [
          {
            platform: "yad2",
            destination: "yad2",
            status: "failed",
            reasonCode: "needs_mapping",
            safeMessage: "The expected Yad2 form was not recognized.",
            updatedAt: "2026-09-19T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(text).toContain("The expected Yad2 form was not recognized.");
    expect(text).toContain(
      "Next action: Inspect Yad2 in Shark Chrome; no automatic retry will run.",
    );
  });
});
