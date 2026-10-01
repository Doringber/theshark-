#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserSession } from "../cli/lib/browser-session.mjs";
import { fillYad2Listing } from "../cli/lib/fill-lite.mjs";

const assetsDir = dirname(fileURLToPath(import.meta.url));
const outPath = join(assetsDir, "shark-browser-form.png");

const facts = {
  title: "Oak desk",
  price: "120",
  condition: "good",
  location: "Haifa",
  details: "Solid wood; small scratch on top",
};

const session = new BrowserSession();
try {
  const page = await session.getPage({ reuseUrlIncludes: "yad2.co.il" });
  const result = await fillYad2Listing(page, facts);
  if (result.status !== "form_filled") {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  const resume = page.getByRole("button", { name: "חזרה לפרסום" }).first();
  if (await resume.isVisible().catch(() => false)) {
    await resume.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const title = page.getByTestId("text-field-title").first();
  await title.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2,h3,h4")].find((el) =>
      el.textContent?.includes("פרטי המוצר"),
    );
    heading?.scrollIntoView({ block: "start" });
  });
  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(600);
  await mkdir(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  process.stdout.write(`${outPath}\n`);
} finally {
  await session.detach();
}
