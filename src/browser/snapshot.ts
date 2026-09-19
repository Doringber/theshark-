import type { Page } from "playwright";
import { redact, redactUrl } from "../services/redaction.js";

/** Sanitized snapshot of a page's accessible structure */
export interface PageSnapshot {
  url: string;
  title: string;
  /** Accessible tree summary (roles + labels, no cookies/storage/headers) */
  accessibilityTree: AccessibilityNode[];
  /** Timestamp */
  capturedAt: string;
}

export interface AccessibilityNode {
  role: string;
  name: string;
  children?: AccessibilityNode[];
}

/**
 * Capture a sanitized accessibility/DOM snapshot of a page.
 * Never includes cookies, storage, headers, message content, or sensitive query strings.
 */
export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  const rawUrl = page.url();
  const title = await page.title();

  // Build a simplified accessible tree from the page
  const tree = await page.evaluate(`
    (() => {
      function walk(el) {
        var role = el.getAttribute("role") || el.tagName.toLowerCase();
        var name = el.getAttribute("aria-label") || el.getAttribute("data-testid") || "";
        if (["script", "style", "noscript"].includes(el.tagName.toLowerCase())) {
          return null;
        }
        var children = [];
        for (var i = 0; i < el.children.length; i++) {
          var node = walk(el.children[i]);
          if (node) children.push(node);
        }
        if (!name && children.length === 0) return null;
        var result = { role: role, name: name };
        if (children.length > 0) result.children = children;
        return result;
      }
      var root = walk(document.body);
      return root ? [root] : [];
    })()
  `);

  return {
    url: redactUrl(rawUrl),
    title: redact(title),
    accessibilityTree: tree as AccessibilityNode[],
    capturedAt: new Date().toISOString(),
  };
}
