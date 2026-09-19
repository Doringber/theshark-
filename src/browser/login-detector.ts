import type { Page } from "playwright";

/** Login detection result */
export type LoginState = "logged_in" | "login_required" | "unknown";

/** Indicators that suggest a login form or authentication wall */
const LOGIN_INDICATORS = [
  '[aria-label="Login"]',
  '[aria-label="Login form"]',
  '[aria-label="Log In"]',
  '[aria-label="QR Login"]',
  '[aria-label="QR Code"]',
  '[data-testid="qr-code"]',
  'input[type="password"]',
  '[aria-label="התחברות"]',
  '[aria-label="סיסמה"]',
];

/** Indicators that suggest a logged-in state */
const LOGGED_IN_INDICATORS = [
  '[data-testid="user-name"]',
  '[aria-label="User menu"]',
  '[aria-label="Home"]',
  '[aria-label="Chat"]',
  '[aria-label="Publish"]',
  '[aria-label="Marketplace"]',
];

/** Indicators of a security checkpoint or challenge */
const CHECKPOINT_INDICATORS = [
  '[aria-label="CAPTCHA"]',
  '[aria-label="Security check"]',
  '[aria-label="Two-factor"]',
  '[aria-label="2FA"]',
  'iframe[src*="captcha"]',
  '[data-testid="captcha"]',
];

export interface LoginDetectionResult {
  state: LoginState;
  /** If a checkpoint was detected, describe it */
  checkpoint?: string;
}

/**
 * Check if a selector matches a visible element on the page.
 */
async function isVisible(page: Page, selector: string): Promise<boolean> {
  const count = await page.locator(selector).count();
  if (count === 0) return false;
  return page.locator(selector).first().isVisible();
}

/**
 * Detect the login state of a platform page.
 * Returns logged_in, login_required, or unknown.
 * Only considers visible elements to avoid matching hidden DOM nodes.
 * If a security checkpoint is detected, returns unknown with a checkpoint description.
 */
export async function detectLoginState(page: Page): Promise<LoginDetectionResult> {
  // First check for security checkpoints — these always require manual action
  for (const selector of CHECKPOINT_INDICATORS) {
    if (await isVisible(page, selector)) {
      return {
        state: "unknown",
        checkpoint: `Security checkpoint detected: ${selector}`,
      };
    }
  }

  // Check for logged-in indicators (must be visible)
  for (const selector of LOGGED_IN_INDICATORS) {
    if (await isVisible(page, selector)) {
      return { state: "logged_in" };
    }
  }

  // Check for login form indicators (must be visible)
  for (const selector of LOGIN_INDICATORS) {
    if (await isVisible(page, selector)) {
      return { state: "login_required" };
    }
  }

  return { state: "unknown" };
}
