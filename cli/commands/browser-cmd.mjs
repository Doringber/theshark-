import {
  cdpAlive,
  ensureSharkChrome,
  focusChromeWindow,
  openCdpTab,
  resolveChromeBin,
  SHARK_CHROME_DIR,
  SHARK_CDP_URL,
} from "../lib/shark-chrome.mjs";

/** @param {string | undefined} selected @param {{ alive: typeof cdpAlive, launch: typeof ensureSharkChrome }} dependencies */
export async function resolveBrowserEndpoint(selected, dependencies = { alive: cdpAlive, launch: ensureSharkChrome }) {
  if (selected) {
    if (!(await dependencies.alive(selected))) {
      throw new Error(`Cannot reach Chrome CDP at ${selected}. Start that browser or remove --cdp / SHARK_CDP_URL to launch Shark Chrome locally.`);
    }
    return selected;
  }
  return dependencies.launch();
}

/** @param {{ url?: string, cdp?: string }} opts */
export async function runBrowser(opts = {}) {
  const selected = opts.cdp ?? process.env.SHARK_CDP_URL?.trim();
  const cdp = await resolveBrowserEndpoint(selected);
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
  if (!selected) console.log(`  Profile: ${SHARK_CHROME_DIR}`);
  console.log("  Log in once per site here; later commands reuse this browser session.");
}
