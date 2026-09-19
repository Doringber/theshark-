import type { Page } from "playwright";
import type { BrowserSession } from "../browser/session.js";
import type { BrowserPort } from "./sell-orchestrator.js";

export function wrapSession(session: BrowserSession): BrowserPort {
  return {
    getPage: (opts) => session.getPage(opts),
    focus: async (page: Page): Promise<void> => {
      await page.bringToFront().catch(() => {});
    },
    pages: () => session.pages(),
    detach: () => session.detach(),
    close: () => session.close(),
    isAttached: () => session.isAttached(),
  };
}
