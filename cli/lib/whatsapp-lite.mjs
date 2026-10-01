import { PLATFORMS } from "./platforms.mjs";

/** @param {{ title: string, price: string, location?: string, details?: string }} facts */
export function buildWhatsAppMessage(facts) {
  const lines = [`למכירה: ${facts.title}`, `מחיר: ₪${facts.price}`];
  if (facts.location?.trim()) lines.push(`איסוף: ${facts.location}`);
  if (facts.details?.trim()) lines.push("", facts.details.trim());
  lines.push("", "Draft only — review before sending.");
  return lines.join("\n");
}

/** @param {import("playwright-core").Page} page */
export async function verifyWhatsAppLogin(page) {
  await page
    .getByRole("button", { name: "Use here" })
    .click({ timeout: 3_000 })
    .catch(() => {});

  const search = page.locator('#side input[role="textbox"]').first();
  const qr = page.locator('canvas[aria-label*="QR" i]').first();
  await search
    .or(qr)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});

  if (await search.isVisible().catch(() => false)) {
    return { state: /** @type {const} */ ("logged_in") };
  }
  if (await qr.isVisible().catch(() => false)) {
    return { state: /** @type {const} */ ("login_required") };
  }
  return { state: /** @type {const} */ ("unknown") };
}

/** @param {import("playwright-core").Page} page @param {string} chatName */
export async function openWhatsAppChat(page, chatName) {
  const search = page.locator('#side input[role="textbox"]').first();
  await search.click();
  await search.fill("");
  await search.fill(chatName);
  const row = page.locator(`#pane-side span[title="${chatName.replace(/"/g, '\\"')}"]`).first();
  try {
    await row.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    await page.keyboard.press("Escape");
    return false;
  }
  await row.click();
  const composer = page.locator('#main [role="textbox"]').first();
  await composer.waitFor({ state: "visible", timeout: 8_000 });
  return true;
}

/**
 * @param {import("playwright-core").Page} page
 * @param {{ title: string, price: string, condition: string, location?: string, details?: string }} facts
 * @param {{ waTo?: string }} options
 */
export async function prepareWhatsAppListing(page, facts, options = {}) {
  await page.goto(PLATFORMS.whatsapp.homeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const login = await verifyWhatsAppLogin(page);
  if (login.state === "login_required") {
    return { status: "login_required", platform: "whatsapp" };
  }
  if (login.state === "unknown") {
    return { status: "needs_mapping", platform: "whatsapp", reason: "WhatsApp UI not ready" };
  }

  const message = buildWhatsAppMessage(facts);
  const waTo = options.waTo?.trim();
  if (!waTo) {
    await page.bringToFront().catch(() => {});
    return {
      status: "session_ready",
      platform: "whatsapp",
      note: "Pass --wa-to with the exact chat or group name to paste the draft in the composer (Send is never clicked).",
      messagePreview: message,
    };
  }

  const opened = await openWhatsAppChat(page, waTo);
  if (!opened) {
    return {
      status: "needs_mapping",
      platform: "whatsapp",
      reason: `Chat "${waTo}" not found — check the exact sidebar title`,
    };
  }

  const composer = page.locator('#main [role="textbox"]').first();
  await composer.click();
  await composer.fill(message);
  await page.bringToFront().catch(() => {});
  return {
    status: "compose_ready",
    platform: "whatsapp",
    destination: waTo,
    note: "Message is in the composer only — review and press Send yourself.",
  };
}
