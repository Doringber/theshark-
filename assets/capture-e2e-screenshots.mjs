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

/** @param {import("playwright-core").Page} page */
async function dismissYad2Resume(page) {
  const resume = page.getByRole("button", { name: "חזרה לפרסום" }).first();
  if (await resume.isVisible().catch(() => false)) {
    await resume.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** Redact chat names and message previews before marketing screenshots. */
async function sanitizeWhatsAppForScreenshot(page) {
  await page.evaluate(() => {
    const side = document.querySelector("#pane-side");
    if (side) {
      side.querySelectorAll("span[title], [dir='auto']").forEach((el) => {
        if (el instanceof HTMLElement) {
          el.textContent = "•••";
          el.removeAttribute("title");
        }
      });
      side.querySelectorAll("img").forEach((img) => {
        img.style.visibility = "hidden";
      });
    }
    const main = document.querySelector("#main");
    if (main) {
      main.querySelectorAll("span[title], [data-pre-plain-text]").forEach((el) => {
        if (el instanceof HTMLElement) el.textContent = "•••";
      });
      main.querySelectorAll("img").forEach((img) => {
        img.style.visibility = "hidden";
      });
    }
  });
  await page.addStyleTag({
    content: `
      #pane-side { filter: blur(6px); }
      #main [role="row"] { filter: blur(8px); }
      #main footer { filter: none !important; }
    `,
  });
}

/** @param {import("playwright-core").Page} page */
async function scrollYad2ProductDetails(page) {
  await dismissYad2Resume(page);
  const title = page.getByTestId("text-field-title").first();
  await title.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2,h3,h4")].find((el) =>
      el.textContent?.includes("פרטי המוצר"),
    );
    heading?.scrollIntoView({ block: "start" });
  });
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
  await fbPage.getByLabel("Title").first().scrollIntoViewIfNeeded().catch(() => {});
  await fbPage.waitForTimeout(400);
  await fbPage.screenshot({ path: join(assetsDir, "shark-browser-facebook.png") });

  const waPage = await session.getPage({ reuseUrlIncludes: "web.whatsapp.com" });
  const waTo = process.env.SHARK_DEMO_WA_TO?.trim();
  const wa = await prepareWhatsAppListing(waPage, facts, { waTo });
  if (wa.status !== "session_ready" && wa.status !== "compose_ready") {
    console.error("whatsapp", wa);
    process.exit(1);
  }
  await waPage.setViewportSize({ width: 1280, height: 800 });
  await waPage.waitForTimeout(500);
  await sanitizeWhatsAppForScreenshot(waPage);
  await waPage.screenshot({ path: join(assetsDir, "shark-browser-whatsapp.png") });

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
