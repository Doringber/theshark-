#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserSession } from "../cli/lib/browser-session.mjs";
import {
  fillFacebookListing,
  fillYad2Listing,
  prepareWhatsAppListing,
} from "../cli/lib/fill-lite.mjs";

const assetsDir = dirname(fileURLToPath(import.meta.url));

const facts = {
  title: "Oak desk",
  price: "120",
  condition: "good",
  location: "Haifa",
  details: "Solid wood; small scratch on top",
};

const VIEWPORT = { width: 1280, height: 900 };

/** @param {import("playwright-core").Page} page */
async function dismissYad2Resume(page) {
  const resume = page.getByRole("button", { name: "חזרה לפרסום" }).first();
  if (await resume.isVisible().catch(() => false)) {
    await resume.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** Blur chat list and history; keep the drafted composer text readable. */
async function sanitizeWhatsAppForScreenshot(page) {
  await page.evaluate(() => {
    const side = document.querySelector("#pane-side");
    if (side instanceof HTMLElement) {
      side.style.filter = "blur(12px)";
      side.querySelectorAll("input").forEach((input) => {
        if (input instanceof HTMLInputElement) input.value = "";
      });
    }
    const main = document.querySelector("#main");
    if (!(main instanceof HTMLElement)) return;

    const footer = main.querySelector("footer");
    for (const child of main.children) {
      if (child instanceof HTMLElement && child !== footer && !child.contains(footer)) {
        child.style.filter = "blur(10px)";
      }
    }

    const header = main.querySelector("header");
    if (header instanceof HTMLElement) {
      header.style.filter = "none";
      header.querySelectorAll("span").forEach((span) => {
        if (span instanceof HTMLElement) span.textContent = "קבוצת מכירה (דמו)";
      });
    }

    if (footer instanceof HTMLElement) {
      footer.style.filter = "none";
      footer.querySelectorAll("*").forEach((el) => {
        if (el instanceof HTMLElement) el.style.filter = "none";
      });
    }
  });
}

/** @param {import("playwright-core").Page} page */
async function screenshotFacebookForm(page, outPath) {
  await page.setViewportSize(VIEWPORT);
  await page.getByLabel("Title").first().scrollIntoViewIfNeeded().catch(() => {});
  const moreBtn = page.getByRole("button", { name: /More details/i }).first();
  if (await moreBtn.isVisible().catch(() => false)) {
    await moreBtn.click().catch(() => {});
  }
  await page.getByLabel("Description").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: outPath });
}

/** @param {import("playwright-core").Page} page */
async function scrollYad2ProductDetails(page) {
  await dismissYad2Resume(page);
  await page.setViewportSize(VIEWPORT);
  const title = page.getByTestId("text-field-title").first();
  await title.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2,h3,h4")].find((el) =>
      el.textContent?.includes("פרטי המוצר"),
    );
    heading?.scrollIntoView({ block: "start" });
  });
}

/** @param {import("playwright-core").Page} page */
async function screenshotWhatsAppComposer(page, outPath) {
  await page.setViewportSize(VIEWPORT);
  const composer = page.locator("#main footer [role='textbox']").first();
  await composer.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await sanitizeWhatsAppForScreenshot(page);
  await page.screenshot({ path: outPath });
}

function resolveWhatsAppDemoChat() {
  const waTo = process.env.SHARK_DEMO_WA_TO?.trim();
  if (!waTo) {
    console.error(
      "Set SHARK_DEMO_WA_TO to an exact WhatsApp sidebar title before capturing (e.g. a selling group you own).",
    );
    process.exit(1);
  }
  return waTo;
}

const session = new BrowserSession();
try {
  await mkdir(assetsDir, { recursive: true });

  const fbPage = await session.getPage({ reuseUrlIncludes: "facebook.com" });
  const fb = await fillFacebookListing(fbPage, facts);
  if (fb.status !== "form_filled") {
    console.error("facebook", fb);
    process.exit(1);
  }
  await screenshotFacebookForm(fbPage, join(assetsDir, "shark-browser-facebook.png"));

  const waTo = resolveWhatsAppDemoChat();
  const waPage = await session.getPage({ reuseUrlIncludes: "web.whatsapp.com" });
  const wa = await prepareWhatsAppListing(waPage, facts, { waTo });
  if (wa.status !== "compose_ready") {
    console.error("whatsapp", wa);
    process.exit(1);
  }
  await screenshotWhatsAppComposer(waPage, join(assetsDir, "shark-browser-whatsapp.png"));

  const y2Page = await session.getPage({ reuseUrlIncludes: "yad2.co.il" });
  const y2 = await fillYad2Listing(y2Page, facts);
  if (y2.status !== "form_filled") {
    console.error("yad2", y2);
    process.exit(1);
  }
  await scrollYad2ProductDetails(y2Page);
  await y2Page.waitForTimeout(400);
  await y2Page.screenshot({ path: join(assetsDir, "shark-browser-yad2.png") });

  process.stdout.write("assets/shark-browser-facebook.png\n");
  process.stdout.write("assets/shark-browser-whatsapp.png\n");
  process.stdout.write("assets/shark-browser-yad2.png\n");
} finally {
  await session.detach();
}
