import { BrowserSession } from "../lib/browser-session.mjs";
import { focusChromeWindow } from "../lib/shark-chrome.mjs";
import { parsePlatform, PLATFORMS } from "../lib/platforms.mjs";

/** @param {{ platform: string, cdp?: string }} opts */
export async function runAuth(opts) {
  const platform = parsePlatform(opts.platform);
  const meta = PLATFORMS[platform];
  const session = new BrowserSession({ cdpUrl: opts.cdp ?? BrowserSession.defaultCdpUrl() });

  console.log(`\nShark auth — ${meta.label}`);
  console.log(`  URL: ${meta.homeUrl}\n`);

  const page = await session.getPage({ reuseUrlIncludes: new URL(meta.homeUrl).hostname });
  await page.goto(meta.homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await focusChromeWindow();

  console.log("Opened a tab in Shark Chrome.");
  console.log("Log in manually in that window (once). Sessions stay in ~/.shark/chrome.");
  console.log("Shark detaches and leaves your tabs open.\n");

  await session.detach();
}
