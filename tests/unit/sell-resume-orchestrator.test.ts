import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { RunStore } from "../../src/services/run-store.js";
import { createHumanNotifier } from "../../src/services/human-notify.js";
import {
  resumeSellFlow,
  runSellFlow,
} from "../../src/orchestration/sell-orchestrator.js";
import type {
  PlatformAdapter,
  DraftResult,
  PlatformPreview,
  SubmissionResult,
} from "../../src/platforms/platform-adapter.js";
import type { ApprovalToken } from "../../src/services/approvals.js";
import type { ApprovedListing } from "../../src/domain/schemas.js";
import { getDefaultConfig } from "../../src/domain/config.js";
import { acquireRunLock, RunLockedError } from "../../src/services/run-lock.js";

const PHOTO = join(process.cwd(), "tests/fixtures/images/test-photo-1.jpg");
const PHOTO_2 = join(process.cwd(), "tests/fixtures/images/test-photo-2.jpg");

class FakeAdapter implements PlatformAdapter {
  readonly name: "facebook" | "whatsapp" | "yad2";
  prepareCalls = 0;
  submitCalls = 0;
  uploads = 0;
  sentTo: string[] = [];
  draftQueue: DraftResult[] = [];
  submitResult: SubmissionResult;
  alreadySentChats: string[] = [];

  constructor(name: "facebook" | "whatsapp" | "yad2") {
    this.name = name;
    this.submitResult = { status: "published", destination: name };
  }

  async verifyLogin(): Promise<"logged_in"> {
    return "logged_in";
  }

  async prepareDraft(
    _page: Page,
    _listing: ApprovedListing,
    context?: { completedSteps?: string[] },
  ): Promise<DraftResult> {
    this.prepareCalls += 1;
    const queued = this.draftQueue.shift();
    if (queued) return queued;
    if (!context?.completedSteps?.includes("upload_photos")) {
      this.uploads += 1;
    }
    return {
      success: true,
      completedSteps: ["upload_photos", "fill_title"],
      completedActions: ["upload_images", "create_draft"],
    };
  }

  async preview(): Promise<PlatformPreview> {
    return {
      platform: this.name,
      title: "MacBook Air",
      description: "עובד",
      price: "300",
      images: [],
      destinations: [this.name],
    };
  }

  async submit(_page: Page, _approval: ApprovalToken): Promise<SubmissionResult> {
    this.submitCalls += 1;
    if (this.name === "whatsapp") {
      this.sentTo.push("Family");
    }
    return this.submitResult;
  }
}

function listingFlags() {
  return {
    images: [PHOTO],
    publish: false,
    title: "MacBook Air",
    price: 300,
    description: "עובד מצוין",
    condition: "good" as const,
    location: "תל אביב",
    defects: "אין",
    pickupDelivery: "איסוף עצמי",
    platforms: ["facebook", "whatsapp", "yad2"] as Array<
      "facebook" | "whatsapp" | "yad2"
    >,
    captchaTimeoutMs: 50,
    pollIntervalMs: 10,
  };
}

describe("sell resume orchestrator", () => {
  let storePath: string;
  let store: RunStore;
  let facebook: FakeAdapter;
  let whatsapp: FakeAdapter;
  let yad2: FakeAdapter;
  const fakePage = {} as Page;

  beforeEach(async () => {
    storePath = await mkdtemp(join(tmpdir(), "shark-orch-"));
    store = new RunStore(storePath);
    facebook = new FakeAdapter("facebook");
    whatsapp = new FakeAdapter("whatsapp");
    yad2 = new FakeAdapter("yad2");
  });

  function deps(overrides: Record<string, unknown> = {}) {
    const writes: string[] = [];
    return {
      store,
      storePath,
      config: getDefaultConfig(),
      session: {
        getPage: async () => fakePage,
        focus: async () => {},
        pages: () => [fakePage],
        detach: async () => {},
        close: async () => {},
        isAttached: () => true,
      },
      adapters: { facebook, whatsapp, yad2 },
      notify: createHumanNotifier({
        write: (text) => writes.push(text),
        spawn: () => {},
      }),
      prompts: {
        confirm: async () => true,
        input: async () => "",
        select: async <T>(_m: string, choices: { value: T }[]) => {
          const first = choices[0];
          if (!first) throw new Error("no choices");
          return first.value;
        },
        checkbox: async <T>(_m: string, choices: { value: T }[]) =>
          choices.map((c) => c.value),
      },
      detectChallenge: async () => ({ present: false }),
      waitForChallenge: async () => "cleared" as const,
      identifyPage: async () => "form_ready" as const,
      writes,
      ...overrides,
    };
  }

  it("pauses Yad2 on CAPTCHA and still finishes Facebook and WhatsApp drafts", async () => {
    yad2.draftQueue.push({
      success: false,
      challenge: "hcaptcha",
      completedSteps: [],
      nextStep: "upload_photos",
    });
    const result = await runSellFlow(
      listingFlags(),
      deps({ waitForChallenge: async () => "timeout" }),
    );
    const yad2Dest = result.results.find((r) => r.destination === "yad2");
    expect(yad2Dest?.status).toBe("awaiting_human_captcha");
    expect(facebook.prepareCalls).toBe(1);
    expect(whatsapp.prepareCalls).toBe(1);
    expect(yad2.submitCalls).toBe(0);
    expect(facebook.submitCalls).toBe(0);
  });

  it("resumes after process exit without re-uploading completed fields", async () => {
    const created = await runSellFlow(listingFlags(), deps());
    yad2.uploads = 0;
    yad2.prepareCalls = 0;
    await store.saveDestinationCheckpoint(created.runId, {
      platform: "yad2",
      destination: "yad2",
      status: "awaiting_human_captcha",
      nextStep: "fill_price",
      completedSteps: ["upload_photos", "fill_title"],
      completedActions: ["upload_images"],
    });
    const resumed = await resumeSellFlow(created.runId, listingFlags(), deps());
    expect(yad2.prepareCalls).toBe(1);
    expect(yad2.uploads).toBe(0);
    expect(resumed.results.find((r) => r.destination === "yad2")?.status).toBe(
      "draft_ready",
    );
  });

  it("skips a completed platform and does not message a WhatsApp group twice", async () => {
    const first = await runSellFlow(
      { ...listingFlags(), publish: true, noDryRun: true },
      deps(),
    );
    expect(whatsapp.submitCalls).toBe(1);
    const second = await resumeSellFlow(first.runId, listingFlags(), deps());
    expect(facebook.prepareCalls).toBe(1);
    expect(whatsapp.submitCalls).toBe(1);
    expect(second.results.find((r) => r.destination === "whatsapp")?.status).toBe(
      "submitted",
    );
  });

  it("asks for a fresh final approval after resume and never reuses a token", async () => {
    const created = await runSellFlow(listingFlags(), deps());
    await store.saveDestinationCheckpoint(created.runId, {
      platform: "yad2",
      destination: "yad2",
      status: "draft_ready",
      completedSteps: ["upload_photos"],
      completedActions: ["upload_images", "create_draft"],
    });
    let confirms = 0;
    const wired = deps({
      prompts: {
        confirm: async () => {
          confirms += 1;
          return true;
        },
        input: async () => "",
        select: async <T>(_m: string, choices: { value: T }[]) => {
          const first = choices[0];
          if (!first) throw new Error("no choices");
          return first.value;
        },
        checkbox: async <T>(_m: string, choices: { value: T }[]) =>
          choices.map((c) => c.value),
      },
    });
    await resumeSellFlow(
      created.runId,
      { ...listingFlags(), publish: true, noDryRun: true },
      wired,
    );
    expect(confirms).toBeGreaterThan(0);
  });

  it("ignores a legacy autoApprove property and requires final approval", async () => {
    let confirms = 0;
    const wired = deps({
      prompts: {
        confirm: async () => {
          confirms += 1;
          return false;
        },
        input: async () => "",
        select: async <T>(_m: string, choices: { value: T }[]) => {
          const first = choices[0];
          if (!first) throw new Error("no choices");
          return first.value;
        },
        checkbox: async <T>(_m: string, choices: { value: T }[]) =>
          choices.map((c) => c.value),
      },
    });

    const legacyUnsafeOptions = {
      ...listingFlags(),
      platforms: ["facebook"] as const,
      publish: true,
      noDryRun: true,
      autoApprove: true,
    };
    const result = await runSellFlow(legacyUnsafeOptions, wired);

    expect(confirms).toBe(1);
    expect(facebook.submitCalls).toBe(0);
    expect(result.results[0]?.status).toBe("skipped");
  });

  it("never retries unknown_submission_state", async () => {
    const created = await runSellFlow(listingFlags(), deps());
    await store.saveDestinationCheckpoint(created.runId, {
      platform: "yad2",
      destination: "yad2",
      status: "unknown_submission_state",
      completedActions: ["publish"],
    });
    yad2.submitCalls = 0;
    yad2.prepareCalls = 0;
    await resumeSellFlow(
      created.runId,
      { ...listingFlags(), publish: true, noDryRun: true },
      deps(),
    );
    expect(yad2.prepareCalls).toBe(0);
    expect(yad2.submitCalls).toBe(0);
  });

  it("rejects two resume commands on the same run", async () => {
    const created = await runSellFlow(listingFlags(), deps());
    const lock = await acquireRunLock(storePath, created.runId);
    await expect(
      resumeSellFlow(created.runId, listingFlags(), deps()),
    ).rejects.toBeInstanceOf(RunLockedError);
    await lock.release();
  });

  it("reuses the existing Yad2 tab instead of opening a new page", async () => {
    const yad2Page = {
      url: () => "http://127.0.0.1:4173/yad2/captcha.html",
      goto: async () => {
        throw new Error("must not navigate away from the live CAPTCHA tab");
      },
    } as unknown as Page;
    yad2.draftQueue.push({
      success: false,
      challenge: "hcaptcha",
      completedSteps: [],
      nextStep: "upload_photos",
    });
    const wired = deps({
      session: {
        getPage: async () => {
          throw new Error("must reuse the existing Yad2 tab");
        },
        focus: async () => {},
        pages: () => [yad2Page],
        detach: async () => {},
        close: async () => {},
        isAttached: () => true,
      },
      waitForChallenge: async () => "timeout" as const,
    });
    const result = await runSellFlow({ ...listingFlags(), platforms: ["yad2"] }, wired);
    expect(result.results[0]?.status).toBe("awaiting_human_captcha");
  });

  it("excludes unsafe images from the approved master listing", async () => {
    const result = await runSellFlow(
      {
        ...listingFlags(),
        images: [PHOTO, PHOTO_2],
        analysisOnlyIndices: [1],
        platforms: ["facebook"],
      },
      deps(),
    );
    const run = await store.getRun(result.runId);
    expect(run?.listing?.imagePaths).toEqual([PHOTO]);
  });
});
