import type { Page } from "playwright";

export type ChallengeKind =
  "hcaptcha" | "recaptcha" | "cloudflare" | "security_checkpoint";

export interface ChallengeSignals {
  url: string;
  visibleText: string;
  iframeSrcs: string[];
  ariaLabels: string[];
  testIds: string[];
}

export interface ChallengeDetection {
  present: boolean;
  kind?: ChallengeKind;
}

const HCAPTCHA_TEXT = /are you for real/i;
const HUMAN_VERIFY_TEXT = /verify you are human|confirm it'?s you|security check/i;
const CLOUDFLARE_HOST = /cdn-cgi|cloudflare/i;
const HCAPTCHA_IFRAME = /hcaptcha/i;
const RECAPTCHA_IFRAME = /recaptcha|google.com\/recaptcha/i;

export function matchChallenge(signals: ChallengeSignals): ChallengeDetection {
  const iframeBlob = signals.iframeSrcs.join(" ");
  const labels = signals.ariaLabels.join(" ");
  const text = signals.visibleText;
  const testIds = signals.testIds.join(" ");

  if (HCAPTCHA_TEXT.test(text) || HCAPTCHA_IFRAME.test(iframeBlob)) {
    return { present: true, kind: "hcaptcha" };
  }
  if (RECAPTCHA_IFRAME.test(iframeBlob)) {
    return { present: true, kind: "recaptcha" };
  }
  if (
    CLOUDFLARE_HOST.test(signals.url) ||
    CLOUDFLARE_HOST.test(labels) ||
    (/verify you are human/i.test(text) && CLOUDFLARE_HOST.test(labels + signals.url))
  ) {
    return { present: true, kind: "cloudflare" };
  }
  if (/cloudflare security challenge/i.test(labels)) {
    return { present: true, kind: "cloudflare" };
  }
  if (
    HUMAN_VERIFY_TEXT.test(text) ||
    /security check|two-factor|2fa|captcha/i.test(labels) ||
    /captcha/i.test(testIds) ||
    /\/checkpoint\//i.test(signals.url)
  ) {
    return { present: true, kind: "security_checkpoint" };
  }
  return { present: false };
}

async function collectSignals(page: Page): Promise<ChallengeSignals> {
  const iframeSrcs = await page
    .locator("iframe")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const el = n as HTMLElement;
          if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
          return el.getClientRects().length > 0;
        })
        .map((n) => (n as HTMLIFrameElement).src || "")
        .filter(Boolean),
    )
    .catch(() => [] as string[]);

  const ariaLabels = await page
    .locator("[aria-label]")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const el = n as HTMLElement;
          if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
          return el.getClientRects().length > 0;
        })
        .map((n) => n.getAttribute("aria-label") ?? "")
        .filter((label) => label.length > 0),
    )
    .catch(() => [] as string[]);

  const testIds = await page
    .locator("[data-testid]")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const el = n as HTMLElement;
          if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
          return el.getClientRects().length > 0;
        })
        .map((n) => n.getAttribute("data-testid") ?? "")
        .filter((id) => id.length > 0),
    )
    .catch(() => [] as string[]);

  const visibleText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "")
    .catch(() => "");

  return {
    url: page.url(),
    visibleText,
    iframeSrcs,
    ariaLabels,
    testIds,
  };
}

/** Detect a visible CAPTCHA or security challenge. Never interact with it. */
export async function detectChallenge(page: Page): Promise<ChallengeDetection> {
  return matchChallenge(await collectSignals(page));
}

export async function waitForChallengeClear(
  page: Page,
  options: { timeoutMs: number; intervalMs?: number },
): Promise<"cleared" | "timeout"> {
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const detection = await detectChallenge(page);
    if (!detection.present) return "cleared";
    await page.waitForTimeout(intervalMs);
  }
  return "timeout";
}
