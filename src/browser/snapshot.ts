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
  const tree = await page.evaluate(() => {
    function walk(el: Element): {
      role: string;
      name: string;
      children?: { role: string; name: string; children?: unknown[] }[];
    } | null {
      const role = el.getAttribute("role") || el.tagName.toLowerCase();
      const name =
        el.getAttribute("aria-label") || el.getAttribute("data-testid") || "";

      // Skip script, style, and hidden elements
      if (["script", "style", "noscript"].includes(el.tagName.toLowerCase())) {
        return null;
      }

      const children: {
        role: string;
        name: string;
        children?: unknown[];
      }[] = [];
      for (const child of el.children) {
        const node = walk(child);
        if (node) children.push(node);
      }

      // Only include nodes with a role/label or meaningful children
      if (!name && children.length === 0) return null;

      return {
        role,
        name,
        ...(children.length > 0 ? { children } : {}),
      };
    }

    const root = walk(document.body);
    return root ? [root] : [];
  });

  return {
    url: redactUrl(rawUrl),
    title: redact(title),
    accessibilityTree: tree as AccessibilityNode[],
    capturedAt: new Date().toISOString(),
  };
}
