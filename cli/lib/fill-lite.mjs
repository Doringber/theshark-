import { detectLoginState } from "./login-detect.mjs";
import { PLATFORMS } from "./platforms.mjs";

const FB_CONDITION_LABEL = {
  new: "New",
  like_new: "Used - Like New",
  good: "Used - Good",
  fair: "Used - Fair",
};

/**
 * @param {import("playwright-core").Page} page
 * @param {{ title: string, price: string, condition: string, location?: string, details?: string }} facts
 */
export async function fillFacebookListing(page, facts) {
  await page.goto(PLATFORMS.facebook.listingUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const login = await detectLoginState(page);
  if (login.state === "login_required" || login.checkpoint) {
    return { status: "login_required", platform: "facebook", checkpoint: login.checkpoint };
  }

  const title = page.getByLabel("Title").first();
  const titleReady = await title
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!titleReady) {
    return { status: "needs_mapping", platform: "facebook", reason: "Title field not visible" };
  }

  await title.fill(facts.title);
  await page.getByLabel("Price").first().fill(facts.price);

  if (facts.location?.trim()) {
    const locationField = page.getByLabel("Location").first();
    if (await locationField.isVisible().catch(() => false)) {
      await locationField.fill(facts.location);
      const suggestion = page.locator('[role="option"], [role="menuitem"]').first();
      if (await suggestion.isVisible().catch(() => false)) {
        await suggestion.click();
      }
    }
  }

  const condLabel = FB_CONDITION_LABEL[facts.condition];
  if (condLabel) {
    const nativeCond = page.locator('select[aria-label="Condition"]').first();
    if (await nativeCond.isVisible().catch(() => false)) {
      await nativeCond.selectOption({ label: condLabel }).catch(() => {});
    }
  }

  const moreBtn = page.getByRole("button", { name: /More details/i }).first();
  if (await moreBtn.isVisible().catch(() => false)) {
    await moreBtn.click().catch(() => {});
  }

  const description = facts.details?.trim() || facts.title;
  const descInput = page.getByLabel("Description").first();
  if (await descInput.isVisible().catch(() => false)) {
    await descInput.fill(description);
  }

  await page.bringToFront().catch(() => {});
  return { status: "form_filled", platform: "facebook" };
}

/**
 * @param {import("playwright-core").Page} page
 * @param {{ title: string, price: string, condition: string, location?: string, details?: string }} facts
 */
async function dismissYad2Overlays(page) {
  const cookieBtn = page.getByTestId("cookie-implementation-disclaimer-submit-button").first();
  if (await cookieBtn.isVisible().catch(() => false)) {
    await cookieBtn.click().catch(() => {});
  }
  const restart = page.getByRole("button", { name: "התחלה מחדש" }).first();
  if (await restart.isVisible().catch(() => false)) {
    await restart.click().catch(() => {});
  }
}

export async function fillYad2Listing(page, facts) {
  await page.goto(PLATFORMS.yad2.listingUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await dismissYad2Overlays(page);

  const login = await detectLoginState(page);
  if (login.state === "login_required" || login.checkpoint) {
    return { status: "login_required", platform: "yad2", checkpoint: login.checkpoint };
  }

  const title = page.getByTestId("text-field-title").first();
  const titleReady = await title
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(async () => {
      await dismissYad2Overlays(page);
      return title.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    });
  if (!titleReady) {
    return { status: "needs_mapping", platform: "yad2", reason: "Title field not visible" };
  }

  await title.fill(facts.title);
  const textArea = page.getByTestId("text-area").first();
  if (await textArea.isVisible().catch(() => false)) {
    await textArea.fill(facts.details?.trim() || facts.title);
  }
  const priceInput = page.getByTestId("price-input").first();
  if (await priceInput.isVisible().catch(() => false)) {
    await priceInput.fill(facts.price);
  }

  await page.bringToFront().catch(() => {});
  return { status: "form_filled", platform: "yad2", note: "Category/type may still need manual input" };
}
