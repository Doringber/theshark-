import {
  ensureSharkChrome,
  focusChromeWindow,
  openCdpTab,
  resolveChromeBin,
  SHARK_CHROME_DIR,
  SHARK_CDP_URL,
} from "../lib/shark-chrome.mjs";

/** @param {{ url?: string }} opts */
export async function runBrowser(opts = {}) {
  const cdp = await ensureSharkChrome();
  if (!cdp) {
    console.error(`Google Chrome not found (tried: ${resolveChromeBin()})`);
    console.error("Set SHARK_CHROME_BIN to your Chrome executable path.");
    process.exitCode = 1;
    return;
  }
  if (opts.url) await openCdpTab(cdp, opts.url);
  await focusChromeWindow();
  console.log("Shark Chrome is running");
  console.log(`  CDP:     ${cdp || SHARK_CDP_URL}`);
  console.log(`  Profile: ${SHARK_CHROME_DIR}`);
  console.log("  Log in once per site here; later commands reuse this profile.");
}
