import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { BrowserSession } from "../browser/session.js";
import { captureSnapshot } from "../browser/snapshot.js";
import { loadConfig, type PlatformName } from "../domain/config.js";

export interface InspectOptions {
  platform: PlatformName;
  /** Optional specific URL to inspect instead of platform default */
  url?: string;
  /** Save snapshot to this path */
  output?: string;
  /** Wait time before capturing (ms) */
  wait?: number;
}

export async function runInspect(options: InspectOptions): Promise<string> {
  const { platform, wait = 3000 } = options;

  const configResult = loadConfig({});
  if (!configResult.valid) throw new Error("Config invalid");
  const config = configResult.config;

  const platformConfig = config.platforms[platform];
  const targetUrl = options.url ?? platformConfig.url;

  const profilePath = resolve(
    config.browserProfilePath.replace("~", process.env["HOME"] ?? "~"),
    platform,
  );

  console.log(`\n🔍 Shark Inspect — ${platform}`);
  console.log(`   URL: ${targetUrl}`);
  console.log(`   Profile: ${profilePath}\n`);

  const session = new BrowserSession({
    profilePath,
    headed: true,
  });

  try {
    const page = await session.getPage();
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for page to settle
    console.log(`  ⏳ Waiting ${wait / 1000}s for page to settle...`);
    await new Promise((r) => setTimeout(r, wait));

    // Capture sanitized snapshot
    console.log("  📸 Capturing snapshot...");
    const snapshot = await captureSnapshot(page);

    // Also capture accessible name tree via aria snapshot
    console.log("  🌳 Capturing accessibility tree...");
    const accessibilityTree = await page.locator("body").ariaSnapshot().catch(() => "");

    // Capture all interactive elements with their roles and labels
    console.log("  🎯 Mapping interactive elements...");
    const interactiveElements = await page.evaluate(`
      (() => {
        const elements = [];
        const selectors = [
          "a[href]", "button", "input", "textarea", "select",
          '[role="button"]', '[role="link"]', '[role="tab"]',
          '[role="textbox"]', '[role="menuitem"]',
          "[contenteditable]", "[data-testid]"
        ].join(",");

        document.querySelectorAll(selectors).forEach((el) => {
          const rect = el.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          elements.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
            testId: el.getAttribute("data-testid"),
            text: (el.innerText || "").slice(0, 100).trim(),
            type: el.getAttribute("type"),
            name: el.getAttribute("name"),
            href: (el.getAttribute("href") || "").slice(0, 200),
            visible: visible,
            selector: (() => {
              if (el.getAttribute("data-testid"))
                return '[data-testid="' + el.getAttribute("data-testid") + '"]';
              if (el.getAttribute("aria-label"))
                return '[aria-label="' + el.getAttribute("aria-label") + '"]';
              if (el.id) return "#" + el.id;
              if (el.getAttribute("role"))
                return el.tagName.toLowerCase() + '[role="' + el.getAttribute("role") + '"]';
              return el.tagName.toLowerCase();
            })(),
          });
        });
        return elements;
      })()
    `) as Array<{
      tag: string;
      role: string | null;
      ariaLabel: string | null;
      testId: string | null;
      text: string;
      type: string | null;
      name: string | null;
      href: string | null;
      visible: boolean;
      selector: string;
    }>;

    // Build the full report
    const report = {
      platform,
      url: page.url(),
      timestamp: new Date().toISOString(),
      title: await page.title(),
      snapshot,
      accessibilityTree,
      interactiveElements: interactiveElements.filter((e) => e.visible),
      hiddenElements: interactiveElements.filter((e) => !e.visible),
      stats: {
        totalElements: interactiveElements.length,
        visible: interactiveElements.filter((e) => e.visible).length,
        hidden: interactiveElements.filter((e) => !e.visible).length,
        withAriaLabel: interactiveElements.filter((e) => e.ariaLabel).length,
        withTestId: interactiveElements.filter((e) => e.testId).length,
      },
    };

    // Save report
    const outputDir = resolve(".shark/snapshots");
    await mkdir(outputDir, { recursive: true });
    const outputPath =
      options.output ??
      resolve(
        outputDir,
        `${platform}-${Date.now()}.json`,
      );
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

    // Print summary
    console.log(`\n  📊 Snapshot Summary:`);
    console.log(`     Page title: ${report.title}`);
    console.log(`     URL: ${report.url}`);
    console.log(`     Interactive elements: ${report.stats.totalElements}`);
    console.log(`       Visible: ${report.stats.visible}`);
    console.log(`       With aria-label: ${report.stats.withAriaLabel}`);
    console.log(`       With data-testid: ${report.stats.withTestId}`);
    console.log(`\n  💾 Saved to: ${outputPath}\n`);

    return outputPath;
  } finally {
    await session.close().catch(() => {});
  }
}
