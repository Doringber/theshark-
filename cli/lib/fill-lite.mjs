import { detectLoginState } from "./login-detect.mjs";
import { PLATFORMS } from "./platforms.mjs";

export { prepareWhatsAppListing, buildWhatsAppMessage } from "./whatsapp-lite.mjs";

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
      // The host must inspect suggestions and choose the matching location.
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
  return verifyFilledFields("facebook", [
    ["title", title, facts.title],
    ["price", page.getByLabel("Price").first(), facts.price],
    ["description", descInput, description],
  ], ["condition", "category", "location", "photos"]);
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
}

export async function fillYad2Listing(page, facts) {
  await page.goto(PLATFORMS.yad2.listingUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await dismissYad2Overlays(page);
  const restart = page.getByRole("button", { name: "התחלה מחדש" }).first();
  const resume = page.getByRole("button", { name: "חזרה לפרסום" }).first();
  if (await restart.isVisible().catch(() => false) || await resume.isVisible().catch(() => false)) {
    return { status: "blocked", platform: "yad2", reason: "Existing draft detected; choose whether to resume or replace it before filling" };
  }

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
  return verifyFilledFields("yad2", [
    ["title", title, facts.title],
    ["description", textArea, facts.details?.trim() || facts.title],
    ["price", priceInput, facts.price],
  ], ["condition", "category", "location", "photos"]);
}

// Read back values: a successful click or fill is not proof of a complete listing.
async function verifyFilledFields(platform, fields, unresolved) {
  const verifiedFields = [];
  const missingFields = [...unresolved];
  for (const [name, locator, expected] of fields) {
    const actual = await locator.inputValue().catch(() => undefined);
    if (actual === expected) verifiedFields.push(name);
    else missingFields.push(name);
  }
  return {
    status: missingFields.length ? "partial_fill" : "form_filled",
    platform,
    verifiedFields,
    missingFields,
    note: "Review the live form and complete missing fields with the host browser or manually. No photos uploaded; nothing published.",
  };
}
