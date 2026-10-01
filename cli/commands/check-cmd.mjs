import { BrowserSession } from "../lib/browser-session.mjs";
import { detectLoginState } from "../lib/login-detect.mjs";
import { parsePlatform, PLATFORMS } from "../lib/platforms.mjs";

/** @param {{ platform: string, cdp?: string }} opts */
export async function runCheck(opts) {
  const platform = parsePlatform(opts.platform);
  const meta = PLATFORMS[platform];
  const session = new BrowserSession({ cdpUrl: opts.cdp ?? BrowserSession.defaultCdpUrl() });

  try {
    const page = await session.getPage();
    await page.goto(meta.homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const result = await detectLoginState(page);
    const payload = {
      platform,
      url: page.url(),
      state: result.state,
      checkpoint: result.checkpoint ?? null,
    };
    console.log(JSON.stringify(payload, null, 2));
    if (result.state === "login_required") process.exitCode = 2;
  } finally {
    await session.detach();
  }
}
