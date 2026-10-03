/** @typedef {"logged_in" | "login_required" | "unknown"} LoginState */

const LOGIN_INDICATORS = [
  '[aria-label="Login"]',
  '[aria-label="Login form"]',
  '[aria-label="Log In"]',
  '[aria-label="QR Login"]',
  '[aria-label="QR Code"]',
  '[data-testid="qr-code"]',
  'input[type="password"]',
  'input[name="email"]',
  '[aria-label="התחברות"]',
  '[aria-label="סיסמה"]',
];

const LOGGED_IN_INDICATORS = [
  '[data-testid="user-name"]',
  '[aria-label="User menu"]',
  '[aria-label="Your profile"]',
  '[aria-label="Home"]',
  '[data-testid="profile-menu-button"]',
];

const CHECKPOINT_INDICATORS = [
  '[aria-label="CAPTCHA"]',
  '[aria-label="Security check"]',
  'iframe[src*="captcha"]',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  '[data-testid="captcha"]',
];

/** @param {import("playwright-core").Page} page @param {string} selector */
async function isVisible(page, selector) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return false;
  return loc.isVisible().catch(() => false);
}

/** @param {import("playwright-core").Page} page */
export async function detectLoginState(page) {
  for (const selector of CHECKPOINT_INDICATORS) {
    if (await isVisible(page, selector)) {
      return { state: /** @type {LoginState} */ ("unknown"), checkpoint: selector };
    }
  }

  for (const selector of LOGGED_IN_INDICATORS) {
    if (await isVisible(page, selector)) {
      return { state: /** @type {LoginState} */ ("logged_in") };
    }
  }

  for (const selector of LOGIN_INDICATORS) {
    if (await isVisible(page, selector)) {
      return { state: /** @type {LoginState} */ ("login_required") };
    }
  }

  return { state: /** @type {LoginState} */ ("unknown") };
}
