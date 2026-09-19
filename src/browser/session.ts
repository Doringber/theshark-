import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

/** Default CDP endpoint for the shared Shark Chrome window */
export const SHARK_CDP_URL = "http://localhost:9222";
/** Where the shared Shark Chrome keeps its logins (all platforms in one) */
export const SHARK_CHROME_DIR = join(homedir(), ".shark", "chrome");
export const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function cdpAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Make sure the shared Shark Chrome is running and reachable over CDP.
 * Launches it (real Chrome, own persistent profile, debug port) if needed.
 * Returns the CDP URL, or null if Chrome isn't installed.
 */
export async function ensureSharkChrome(url: string = SHARK_CDP_URL): Promise<string | null> {
  if (await cdpAlive(url)) return url;
  if (!existsSync(CHROME_BIN)) return null;

  await mkdir(SHARK_CHROME_DIR, { recursive: true });
  const port = new URL(url).port || "9222";
  const child = spawn(
    CHROME_BIN,
    [
      `--user-data-dir=${SHARK_CHROME_DIR}`,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await cdpAlive(url)) return url;
  }
  return null;
}

export interface BrowserSessionOptions {
  /** Path to the persistent browser profile */
  profilePath: string;
  /** Launch headed (visible) browser — default true */
  headed?: boolean;
  /** Additional Chromium launch args */
  args?: string[];
  /**
   * Attach to an already-running Chrome via CDP instead of launching a
   * profile browser (e.g. "http://127.0.0.1:9222"). Shark opens a NEW TAB
   * for its work and only closes tabs it created — your tabs stay intact.
   */
  cdpUrl?: string;
}

/**
 * Manages a single Playwright Chromium browser session with a persistent profile.
 * Only one session can use a profile at a time (Chromium enforces this).
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private cdpBrowser: Browser | null = null;
  private attached = false;
  private ownedPages: Page[] = [];
  private readonly options: Required<BrowserSessionOptions>;

  constructor(options: BrowserSessionOptions) {
    this.options = {
      headed: true,
      args: [],
      cdpUrl: "",
      ...options,
    };
  }

  /**
   * Launch the browser with a persistent profile.
   * Throws if the profile is already locked by another process.
   */
  async launch(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Attach mode (default) — reuse the shared Shark Chrome window. Chrome
    // forbids attaching to a user's main profile, so this is the one window
    // where the user logs in once per site and every command reuses it.
    const cdpUrl =
      this.options.cdpUrl === "none"
        ? ""
        : (this.options.cdpUrl || (await ensureSharkChrome()) || "");
    if (cdpUrl) {
      try {
        this.cdpBrowser = await chromium.connectOverCDP(cdpUrl);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cannot attach to Chrome at "${cdpUrl}" (${msg}). ` +
            "Relaunch Chrome with --remote-debugging-port first.",
          { cause: error },
        );
      }
      this.attached = true;
      const contexts = this.cdpBrowser.contexts();
      this.context = contexts[0] ?? (await this.cdpBrowser.newContext());
      return this.context;
    }

    const { profilePath, headed, args } = this.options;

    await mkdir(profilePath, { recursive: true });

    // Check for Chromium lock file (SingletonLock)
    const lockFile = join(profilePath, "SingletonLock");
    if (existsSync(lockFile)) {
      throw new BrowserProfileLockedError(
        `Browser profile is already in use: "${profilePath}". ` +
          "Close the other browser instance or remove the lock file.",
      );
    }

    try {
      this.context = await chromium.launchPersistentContext(profilePath, {
        headless: !headed,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          ...args,
        ],
        viewport: { width: 1280, height: 900 },
        bypassCSP: true,
        ignoreHTTPSErrors: true,
      });

      // Remove webdriver flag from all pages to avoid bot detection
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
      });

      return this.context;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("lock") ||
        msg.includes("already in use") ||
        msg.includes("SingletonLock")
      ) {
        throw new BrowserProfileLockedError(
          `Browser profile is locked: "${profilePath}". ${msg}`,
        );
      }
      throw error;
    }
  }

  /** Get the current page or create a new one */
  async getPage(options: { reuseUrlIncludes?: string } = {}): Promise<Page> {
    const ctx = await this.launch();
    // In attach mode work in a fresh tab — never hijack the user's — unless a
    // tab for this site should be reused (e.g. WhatsApp Web allows one tab only).
    if (this.attached) {
      const existing = options.reuseUrlIncludes
        ? ctx.pages().find((p) => p.url().includes(options.reuseUrlIncludes ?? ""))
        : undefined;
      const page = existing ?? (await ctx.newPage());
      await page.bringToFront().catch(() => {});
      if (!existing) this.ownedPages.push(page);
      return page;
    }
    const pages = ctx.pages();
    return pages[0] ?? (await ctx.newPage());
  }

  /** Close the browser session */
  async close(): Promise<void> {
    for (const page of this.ownedPages) {
      await page.close().catch(() => {});
    }
    this.ownedPages = [];
    // Attach mode: just disconnect — the user's Chrome keeps running.
    if (this.cdpBrowser) {
      await this.cdpBrowser.close().catch(() => {});
      this.cdpBrowser = null;
      this.context = null;
      return;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  /** Check if the session is currently open */
  isOpen(): boolean {
    return this.context !== null;
  }

  /** True when reusing the shared Shark Chrome over CDP */
  isAttached(): boolean {
    return this.attached;
  }

  /** Attach mode only: disconnect and leave every tab open in the window */
  async detach(): Promise<void> {
    this.ownedPages = [];
    if (this.cdpBrowser) {
      await this.cdpBrowser.close().catch(() => {});
      this.cdpBrowser = null;
      this.context = null;
    }
  }
}

export class BrowserProfileLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserProfileLockedError";
  }
}
