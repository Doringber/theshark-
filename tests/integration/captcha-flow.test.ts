import { test, expect } from "@playwright/test";
import {
  detectChallenge,
  waitForChallengeClear,
} from "../../src/browser/challenge-detector.js";
import { identifyPlatformPage } from "../../src/browser/page-identity.js";
import { Yad2Adapter } from "../../src/platforms/yad2.js";
import type { ApprovedListing, ProductImage } from "../../src/domain/schemas.js";
import { createHumanNotifier } from "../../src/services/human-notify.js";
import { RunStore } from "../../src/services/run-store.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:4173";

function makeListing(): ApprovedListing {
  const images: ProductImage[] = [
    {
      path: join(process.cwd(), "tests/fixtures/images/test-photo-1.jpg"),
      mediaType: "image/jpeg",
      order: 0,
      uploadState: "approved_for_upload",
    },
  ];
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    title: "MacBook Air",
    description: "עובד מצוין",
    price: 300,
    currency: "NIS",
    condition: "good",
    location: "תל אביב",
    language: "he",
    images,
    facts: [],
  } as ApprovedListing;
}

test.describe("CAPTCHA detection and pause", () => {
  const adapter = new Yad2Adapter();

  test("detects hCaptcha before form filling and does not type into the form", async ({
    page,
  }) => {
    await page.goto(`${BASE}/yad2/captcha.html`);
    const detected = await detectChallenge(page);
    expect(detected.present).toBe(true);
    expect(detected.kind).toBe("hcaptcha");

    const result = await adapter.prepareDraft(page, makeListing());
    expect(result.success).toBe(false);
    expect(result.challenge).toBe("hcaptcha");
    await expect(page.getByLabel("כותרת")).toBeHidden();
  });

  test("detects a CAPTCHA midway through Yad2 and keeps completed fields", async ({
    page,
  }) => {
    await page.goto(`${BASE}/yad2/captcha-midway.html`);
    const result = await adapter.prepareDraft(page, makeListing());
    expect(result.success).toBe(false);
    expect(result.challenge).toBe("hcaptcha");
    expect(result.completedSteps).toContain("fill_title");
    expect(result.completedSteps).toContain("upload_photos");
    await expect(page.getByLabel("כותרת")).toHaveValue("MacBook Air");
    await expect(page.getByLabel("Upload count")).toHaveText("1");
  });

  test("focuses the blocked tab and notifies once", async ({ context, page }) => {
    const other = await context.newPage();
    await other.goto(`${BASE}/yad2/index.html?state=logged_in`);
    await page.goto(`${BASE}/yad2/captcha.html`);

    const writes: string[] = [];
    const notify = createHumanNotifier({
      write: (text) => writes.push(text),
      spawn: () => {},
    });
    await page.bringToFront();
    await notify.notifyCaptcha({ runId: "run-focus", platform: "yad2" });
    await notify.notifyCaptcha({ runId: "run-focus", platform: "yad2" });

    expect(page.url()).toContain("captcha.html");
    expect(writes.filter((w) => w.includes("needs human verification")).length).toBe(1);
    await other.close();
  });

  test("resumes exactly once after the challenge disappears", async ({ page }) => {
    await page.goto(`${BASE}/yad2/captcha.html`);
    const first = await adapter.prepareDraft(page, makeListing());
    expect(first.challenge).toBe("hcaptcha");

    await page.getByRole("button", { name: "I am human" }).click();
    const cleared = await waitForChallengeClear(page, {
      timeoutMs: 2_000,
      intervalMs: 50,
    });
    expect(cleared).toBe("cleared");
    expect(await identifyPlatformPage(page, "yad2")).toBe("form_ready");

    const second = await adapter.prepareDraft(page, makeListing(), {
      resumeFrom: first.nextStep,
      completedSteps: first.completedSteps ?? [],
    });
    expect(second.success).toBe(true);
    await expect(page.getByLabel("כותרת")).toHaveValue("MacBook Air");
  });

  test("times out a persistent CAPTCHA without solving it", async ({ page }) => {
    await page.goto(`${BASE}/yad2/captcha.html`);
    const cleared = await waitForChallengeClear(page, {
      timeoutMs: 200,
      intervalMs: 50,
    });
    expect(cleared).toBe("timeout");
    expect((await detectChallenge(page)).present).toBe(true);
    await expect(page.getByRole("dialog", { name: "CAPTCHA" })).toBeVisible();
  });

  test("pauses again if the CAPTCHA returns", async ({ page }) => {
    await page.goto(`${BASE}/yad2/captcha.html?autoclose=100`);
    await waitForChallengeClear(page, { timeoutMs: 1_000, intervalMs: 50 });
    await page.evaluate(() => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "CAPTCHA");
      dialog.textContent = "Are you for real?";
      document.body.appendChild(dialog);
    });
    const again = await adapter.prepareDraft(page, makeListing(), {
      completedSteps: ["upload_photos"],
    });
    expect(again.success).toBe(false);
    expect(again.challenge).toBe("hcaptcha");
  });

  test("reports login required when auth expires after CAPTCHA", async ({ page }) => {
    await page.goto(`${BASE}/yad2/login-after.html`);
    expect(await identifyPlatformPage(page, "yad2")).toBe("login");
    expect(await adapter.verifyLogin(page)).toBe("login_required");
  });

  test("returns needs_mapping on an unknown page after CAPTCHA", async ({ page }) => {
    await page.goto(`${BASE}/yad2/unknown-after.html`);
    expect(await identifyPlatformPage(page, "yad2")).toBe("needs_mapping");
    const result = await adapter.prepareDraft(page, makeListing(), {
      completedSteps: ["upload_photos"],
    });
    expect(result.success).toBe(false);
    expect(result.needsMapping).toBe(true);
  });

  test("does not persist CAPTCHA tokens, cookies, or browser storage", async ({
    page,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), "shark-captcha-store-"));
    const store = new RunStore(dir);
    const run = await store.createRun({ listingId: "listing-1", platforms: ["yad2"] });
    await page.goto(`${BASE}/yad2/captcha.html`);
    await page.evaluate(() => {
      document.cookie = "hcaptcha=token-secret";
      localStorage.setItem("cf_clearance", "nope");
    });
    await store.saveDestinationCheckpoint(run.id, {
      platform: "yad2",
      destination: "yad2",
      status: "awaiting_human_captcha",
      nextStep: "upload_photos",
      completedSteps: [],
    });
    const loaded = JSON.stringify(await store.getRun(run.id));
    expect(loaded.toLowerCase()).not.toContain("hcaptcha");
    expect(loaded).not.toContain("token-secret");
    expect(loaded).not.toContain("cf_clearance");
    expect(loaded).not.toContain("localStorage");
  });
});
