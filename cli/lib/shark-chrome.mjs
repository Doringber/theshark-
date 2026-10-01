import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { homedir, platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Shared Shark Chrome CDP port (not 9222 — avoids everyday Chrome). */
export const SHARK_CDP_PORT = 9333;
export const SHARK_CDP_URL = `http://127.0.0.1:${SHARK_CDP_PORT}`;
export const SHARK_CHROME_DIR = join(homedir(), ".shark", "chrome");

const DEFAULT_CHROME_PATHS = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

export function resolveChromeBin() {
  if (process.env.SHARK_CHROME_BIN?.trim()) return process.env.SHARK_CHROME_BIN.trim();
  const fallback = DEFAULT_CHROME_PATHS[platform()] ?? DEFAULT_CHROME_PATHS.linux;
  return fallback;
}

/** @param {string} url */
export async function cdpAlive(url) {
  try {
    const res = await fetch(`${url}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** @param {string} [url] */
export async function ensureSharkChrome(url = SHARK_CDP_URL) {
  if (await cdpAlive(url)) return url;

  const chromeBin = resolveChromeBin();
  if (!existsSync(chromeBin)) return null;

  await mkdir(SHARK_CHROME_DIR, { recursive: true });
  const port = new URL(url).port || String(SHARK_CDP_PORT);
  const child = spawn(
    chromeBin,
    [
      `--user-data-dir=${SHARK_CHROME_DIR}`,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await cdpAlive(url)) return url;
  }
  return null;
}

/** @param {string} cdpUrl @param {string} [pageUrl] */
export async function openCdpTab(cdpUrl, pageUrl) {
  if (!pageUrl) return;
  await fetch(`${cdpUrl}/json/new?${encodeURIComponent(pageUrl)}`, {
    method: "PUT",
  }).catch(() => {});
}

export async function focusChromeWindow() {
  if (platform() === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "Google Chrome" to activate',
    ]).catch(() => {});
  }
}

/** @param {string} cdpUrl @param {unknown} error */
export function describeAttachFailure(cdpUrl, error) {
  const raw = error instanceof Error ? error.message : String(error);
  if (/context management is not supported/i.test(raw)) {
    return (
      `Cannot attach to Chrome at "${cdpUrl}": another Chrome profile owns that port. ` +
      "Close it or set SHARK_CDP_URL to a free port, then run `shark browser`."
    );
  }
  return `Cannot attach to Chrome at "${cdpUrl}" (${raw}). Run \`shark browser\` first.`;
}
