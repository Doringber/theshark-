import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

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

    // Attach mode — reuse the user's own running Chrome.
    if (this.options.cdpUrl) {
      try {
        this.cdpBrowser = await chromium.connectOverCDP(this.options.cdpUrl);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cannot attach to Chrome at "${this.options.cdpUrl}" (${msg}). ` +
            "Relaunch Chrome with --remote-debugging-port first.",
          { cause: error },
        );
      }
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
  async getPage(): Promise<Page> {
    const ctx = await this.launch();
    // In attach mode always work in a fresh tab — never hijack the user's.
    if (this.options.cdpUrl) {
      const page = await ctx.newPage();
      this.ownedPages.push(page);
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
}

export class BrowserProfileLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserProfileLockedError";
  }
}
