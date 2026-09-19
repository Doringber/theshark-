import { test, expect, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectImageSources } from "../../src/services/image-sources.js";
import { RunStore } from "../../src/services/run-store.js";
import { createHumanNotifier } from "../../src/services/human-notify.js";
import { formatRunStatus } from "../../src/services/run-status-view.js";
import {
  resumeSellFlow,
  runSellFlow,
} from "../../src/orchestration/sell-orchestrator.js";
import { FacebookMarketplaceAdapter } from "../../src/platforms/facebook-marketplace.js";
import { WhatsAppWebAdapter } from "../../src/platforms/whatsapp-web.js";
import { Yad2Adapter } from "../../src/platforms/yad2.js";
import { getDefaultConfig } from "../../src/domain/config.js";
import { missingHighValueQuestions } from "../../src/services/listing-proposal.js";
import { findPlatformTab } from "../../src/browser/page-identity.js";

const BASE = "http://127.0.0.1:4173";
const PHOTO_DIR = resolve("tests/fixtures/images/test-product-photos");

test("shark sell fixture journey with Yad2 CAPTCHA resume", async ({ context }) => {
  const collected = collectImageSources([PHOTO_DIR]);
  expect(collected.ok).toBe(true);
  if (!collected.ok) return;
  expect(collected.paths.map((p) => p.split("/").pop())).toEqual([
    "back.jpg",
    "front.jpg",
    "serial.jpg",
  ]);

  const missing = missingHighValueQuestions({
    title: "MacBook Air",
    price: 300,
    description: "עובד מצוין",
    condition: "good",
    location: "תל אביב",
    defects: "אין",
    pickupDelivery: "איסוף עצמי",
  });
  expect(missing).toEqual([]);

  const storePath = await mkdtemp(join(tmpdir(), "shark-e2e-"));
  const store = new RunStore(storePath);
  const writes: string[] = [];
  const facebook = new FacebookMarketplaceAdapter();
  const whatsapp = new WhatsAppWebAdapter();
  const yad2 = new Yad2Adapter();

  const port = {
    getPage: async (opts?: { reuseUrlIncludes?: string | string[] }) => {
      const needles = (
        Array.isArray(opts?.reuseUrlIncludes)
          ? opts.reuseUrlIncludes
          : opts?.reuseUrlIncludes
            ? [opts.reuseUrlIncludes]
            : []
      ).filter(Boolean);
      if (needles.length > 0) {
        const existing = context
          .pages()
          .find((p) => needles.some((needle) => p.url().includes(needle)));
        if (existing) {
          await existing.bringToFront();
          return existing;
        }
      }
      return context.newPage();
    },
    focus: async (page: Page) => {
      await page.bringToFront();
    },
    pages: () => context.pages(),
    detach: async () => {},
    close: async () => {},
    isAttached: () => true,
  };

  const deps = {
    store,
    storePath,
    config: {
      ...getDefaultConfig(),
      platforms: {
        facebook: { enabled: true, url: `${BASE}/facebook/index.html?state=logged_in` },
        whatsapp: { enabled: true, url: `${BASE}/whatsapp/index.html?state=logged_in` },
        yad2: { enabled: true, url: `${BASE}/yad2/captcha.html` },
      },
    },
    session: port,
    adapters: { facebook, whatsapp, yad2 },
    notify: createHumanNotifier({
      write: (text: string) => writes.push(text),
      spawn: () => {},
    }),
    prompts: {
      confirm: async () => false,
      input: async () => "",
      select: async <T>(_m: string, choices: { value: T }[]) => {
        const first = choices[0];
        if (!first) throw new Error("no choices");
        return first.value;
      },
      checkbox: async <T>(_m: string, choices: { value: T }[]) =>
        choices.map((c) => c.value),
    },
    waitForChallenge: async () => "timeout" as const,
    platformUrls: {
      facebook: `${BASE}/facebook/index.html?state=logged_in`,
      whatsapp: `${BASE}/whatsapp/index.html?state=logged_in`,
      yad2: `${BASE}/yad2/captcha.html`,
    },
  };

  const first = await runSellFlow(
    {
      images: collected.paths,
      analysisOnlyIndices: [2],
      publish: false,
      title: "MacBook Air",
      price: 300,
      description: "עובד מצוין",
      condition: "good",
      location: "תל אביב",
      defects: "אין",
      pickupDelivery: "איסוף עצמי",
      category: "Electronics",
      platforms: ["facebook", "yad2", "whatsapp"],
      captchaTimeoutMs: 100,
    },
    deps,
  );

  expect(first.dryRun).toBe(true);
  expect(first.results.find((r) => r.destination === "facebook")?.status).toBe(
    "draft_ready",
  );
  expect(first.results.find((r) => r.destination === "whatsapp")?.status).toBe(
    "draft_ready",
  );
  expect(first.results.find((r) => r.destination === "yad2")?.status).toBe(
    "awaiting_human_captcha",
  );

  const run = await store.getRun(first.runId);
  expect(run?.listing?.imagePaths).toHaveLength(2);
  expect(run?.listing?.imagePaths[0]).toContain("back.jpg");
  expect(run?.listing?.imagePaths[1]).toContain("front.jpg");
  expect(JSON.stringify(run)).not.toMatch(/serial\.jpg/);

  const facebookPage = await findPlatformTab(context.pages(), "facebook");
  const yad2Page = await findPlatformTab(context.pages(), "yad2");
  expect(facebookPage).toBeTruthy();
  expect(yad2Page).toBeTruthy();
  if (!facebookPage || !yad2Page) return;
  await expect(facebookPage.locator("#publish-status")).toHaveText("not_published");
  const waPage = context.pages().find((p) => p.url().includes("whatsapp"));
  if (waPage) {
    const sent = await waPage
      .locator("#send-status")
      .textContent()
      .catch(() => "not_sent");
    expect(sent).not.toBe("sent");
  }

  await yad2Page.getByRole("button", { name: "I am human" }).click();
  const resumed = await resumeSellFlow(
    first.runId,
    {
      images: collected.paths,
      analysisOnlyIndices: [2],
      publish: false,
      title: "MacBook Air",
      price: 300,
      description: "עובד מצוין",
      condition: "good",
      location: "תל אביב",
      platforms: ["facebook", "yad2", "whatsapp"],
    },
    {
      ...deps,
      waitForChallenge: async () => "cleared" as const,
      identifyPage: async () => "form_ready" as const,
    },
  );

  expect(resumed.results.find((r) => r.destination === "facebook")?.status).toBe(
    "draft_ready",
  );
  expect(resumed.results.find((r) => r.destination === "yad2")?.status).toBe(
    "draft_ready",
  );
  const after = await store.getRun(first.runId);
  expect(after).toBeTruthy();
  if (!after) return;
  const summary = formatRunStatus(after);
  expect(summary).toContain("Facebook   draft_ready");
  expect(summary).toContain("Yad2       draft_ready");
  expect(writes.filter((w) => w.includes("needs human verification")).length).toBe(1);
});

test("identifies the active Yad2 draft tab without closing a stale one", async ({
  context,
  page,
}) => {
  const stale = await context.newPage();
  await stale.goto(`${BASE}/yad2/index.html?state=logged_in`);
  await page.goto(`${BASE}/yad2/product-form.html`);
  await page.getByLabel("כותרת").fill("Active draft");
  const chosen = await findPlatformTab(context.pages(), "yad2");
  expect(chosen).toBe(page);
  expect(stale.isClosed()).toBe(false);
  await expect(stale.getByLabel("מוצרים")).toBeVisible();
});
