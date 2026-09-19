import { chromium, type BrowserContext, type Page } from "playwright";
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
}

/**
 * Manages a single Playwright Chromium browser session with a persistent profile.
 * Only one session can use a profile at a time (Chromium enforces this).
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private readonly options: Required<BrowserSessionOptions>;

  constructor(options: BrowserSessionOptions) {
    this.options = {
      headed: true,
      args: [],
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
        args: ["--disable-blink-features=AutomationControlled", ...args],
        viewport: { width: 1280, height: 900 },
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
    const pages = ctx.pages();
    return pages[0] ?? (await ctx.newPage());
  }

  /** Close the browser session */
  async close(): Promise<void> {
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
