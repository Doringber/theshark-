import { mkdir } from "node:fs/promises";
import {
  ensureSharkChrome,
  describeAttachFailure,
  SHARK_CDP_URL,
} from "./shark-chrome.mjs";

/**
 * @typedef {Object} BrowserSessionOptions
 * @property {string} [cdpUrl]
 */

export class BrowserSession {
  /** @type {import("playwright-core").Browser | null} */
  #browser = null;
  /** @type {import("playwright-core").BrowserContext | null} */
  #context = null;
  /** @type {import("playwright-core").Page[]} */
  #ownedPages = [];
  /** @type {BrowserSessionOptions} */
  #options;

  /** @param {BrowserSessionOptions} [options] */
  constructor(options = {}) {
    this.#options = options;
  }

  async launch() {
    if (this.#context) return this.#context;

    const selected = this.#options.cdpUrl;
    const cdpUrl = selected === "none"
      ? ""
      : selected && selected !== SHARK_CDP_URL
        ? selected
        : (await ensureSharkChrome()) || "";
    if (!cdpUrl) {
      throw new Error(
        "Shark Chrome is not running and Google Chrome was not found. Run `shark browser` first.",
      );
    }

    const { chromium } = await import("playwright-core");
    try {
      this.#browser = await chromium.connectOverCDP(cdpUrl);
    } catch (error) {
      throw new Error(describeAttachFailure(cdpUrl, error), { cause: error });
    }
    const contexts = this.#browser.contexts();
    this.#context = contexts[0] ?? (await this.#browser.newContext());
    return this.#context;
  }

  /**
   * @param {{ reuseUrlIncludes?: string | string[] }} [options]
   */
  async getPage(options = {}) {
    const ctx = await this.launch();
    const needles = (
      Array.isArray(options.reuseUrlIncludes)
        ? options.reuseUrlIncludes
        : options.reuseUrlIncludes
          ? [options.reuseUrlIncludes]
          : []
    ).filter(Boolean);

    const existing = needles.length
      ? ctx.pages().find((p) => needles.some((n) => p.url().includes(n)))
      : undefined;
    const page = existing ?? (await ctx.newPage());
    await page.bringToFront().catch(() => {});
    if (!existing) this.#ownedPages.push(page);
    return page;
  }

  async detach() {
    this.#ownedPages = [];
    if (this.#browser) {
      await this.#browser.close().catch(() => {});
      this.#browser = null;
      this.#context = null;
    }
  }

  async close() {
    for (const page of this.#ownedPages) {
      await page.close().catch(() => {});
    }
    await this.detach();
  }

  /** @returns {string} */
  static defaultCdpUrl() {
    return process.env.SHARK_CDP_URL?.trim() || SHARK_CDP_URL;
  }
}

/** Ensures profile dir exists when using non-CDP mode later. */
export async function ensureProfileDir(path) {
  await mkdir(path, { recursive: true });
}
