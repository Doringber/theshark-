import type { Page, Response } from "playwright";
import { validateHostForPlatform, type PlatformName } from "../domain/config.js";

export interface SafeNavigationOptions {
  /** Target platform for host validation */
  platform: PlatformName;
  /** Allow localhost (for test fixtures) */
  allowLocalhost?: boolean;
  /** Timeout for navigation in ms */
  timeout?: number;
}

/**
 * Navigate to a URL with host validation.
 * Rejects navigation to unexpected hosts and blocks redirects to disallowed domains.
 */
export async function safeNavigate(
  page: Page,
  url: string,
  options: SafeNavigationOptions,
): Promise<Response | null> {
  const { platform, allowLocalhost, timeout = 30_000 } = options;

  // Validate the target URL before navigating
  const validation = validateHostForPlatform(url, platform, {
    allowLocalhost,
  });
  if (!validation.valid) {
    throw new NavigationBlockedError(`Navigation blocked: ${validation.reason}`);
  }

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout,
  });

  // After navigation, verify we didn't get redirected to an unexpected host
  const finalUrl = page.url();
  const redirectValidation = validateHostForPlatform(finalUrl, platform, {
    allowLocalhost,
  });
  if (!redirectValidation.valid) {
    throw new NavigationBlockedError(
      `Redirect to unexpected host blocked: ${finalUrl} — ${redirectValidation.reason}`,
    );
  }

  return response;
}

export class NavigationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavigationBlockedError";
  }
}
