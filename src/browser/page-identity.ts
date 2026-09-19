import type { Page } from "playwright";
import type { PlatformName } from "../domain/config.js";
import { detectChallenge } from "./challenge-detector.js";

export type PageIdentity = "form_ready" | "challenge" | "login" | "needs_mapping";

async function visible(locator: ReturnType<Page["locator"]>): Promise<boolean> {
  return locator
    .first()
    .isVisible()
    .catch(() => false);
}

export async function identifyPlatformPage(
  page: Page,
  platform: PlatformName,
): Promise<PageIdentity> {
  if ((await detectChallenge(page)).present) return "challenge";

  if (platform === "yad2") {
    if (
      await visible(page.getByTestId("text-field-title").or(page.getByLabel("כותרת")))
    ) {
      return "form_ready";
    }
    if (
      await visible(
        page.locator(
          '[aria-label="התחברות"], [aria-label="Login"], input[type="password"]',
        ),
      )
    ) {
      return "login";
    }
    return "needs_mapping";
  }

  if (platform === "facebook") {
    if (await visible(page.getByLabel("Title"))) return "form_ready";
    if (
      await visible(page.locator('input[type="password"], [aria-label="Login form"]'))
    ) {
      return "login";
    }
    return "needs_mapping";
  }

  if (await visible(page.locator('[aria-label="Chat"], #side input[role="textbox"]'))) {
    return "form_ready";
  }
  if (
    await visible(page.locator('[aria-label="QR Login"], canvas[aria-label*="QR" i]'))
  ) {
    return "login";
  }
  return "needs_mapping";
}

const HOST: Record<PlatformName, string> = {
  facebook: "facebook.com",
  whatsapp: "web.whatsapp.com",
  yad2: "yad2.co.il",
};

export function platformReuseNeedles(platform: PlatformName): string[] {
  return [HOST[platform], `/${platform}/`];
}

export function pageUrlMatchesPlatform(url: string, platform: PlatformName): boolean {
  if (!url) return false;
  return platformReuseNeedles(platform).some((needle) => url.includes(needle));
}

function pageUrl(page: Page): string {
  return typeof page.url === "function" ? page.url() : "";
}

/**
 * Pick the live platform tab. Prefer a ready draft form. Never close extras.
 */
export async function findPlatformTab(
  pages: Page[],
  platform: PlatformName,
): Promise<Page | undefined> {
  const matches = pages.filter((p) => pageUrlMatchesPlatform(pageUrl(p), platform));
  if (matches.length === 0) return undefined;
  for (const page of matches) {
    const identity = await identifyPlatformPage(page, platform).catch(() => undefined);
    if (identity === "form_ready") return page;
  }
  for (const page of matches) {
    const identity = await identifyPlatformPage(page, platform).catch(() => undefined);
    if (identity === "challenge") return page;
  }
  return matches[0];
}
