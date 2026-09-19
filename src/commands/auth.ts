import { resolve } from "node:path";
import { BrowserSession } from "../browser/session.js";
import { loadConfig, type PlatformName } from "../domain/config.js";

export interface AuthOptions {
  platform: PlatformName;
  /** How long to keep the browser open for login (ms) */
  timeout?: number;
  /** Auto-close after detecting login */
  autoClose?: boolean;
}

export async function runAuth(options: AuthOptions): Promise<void> {
  const { platform, timeout = 300_000 } = options;

  // Load config
  const configResult = loadConfig({});
  if (!configResult.valid) throw new Error("Config invalid");
  const config = configResult.config;

  const platformConfig = config.platforms[platform];
  if (!platformConfig.enabled) {
    console.log(`❌ Platform "${platform}" is disabled in config`);
    return;
  }

  const profilePath = resolve(
    config.browserProfilePath.replace("~", process.env["HOME"] ?? "~"),
    platform,
  );

  console.log(`\n🔐 Shark Auth — ${platform}`);
  console.log(`   Profile: ${profilePath}`);
  console.log(`   URL: ${platformConfig.url}`);
  console.log(`   Timeout: ${timeout / 1000}s\n`);

  const session = new BrowserSession({
    profilePath,
    headed: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-web-security",
    ],
  });

  try {
    const page = await session.getPage();
    await page.bringToFront().catch(() => {});
    await page.goto(platformConfig.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.bringToFront().catch(() => {});

    console.log("🌐 Browser opened. Please log in manually.");
    console.log("   Look for a Chromium window (separate Dock icon).");
    console.log("   The browser will stay open for you to complete login.");
    console.log("   It will auto-close after the timeout.\n");

    // Wait for timeout — user logs in during this time
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, 5000));
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Check if browser was closed by user
      try {
        await page.title();
      } catch {
        console.log("\n✅ Browser closed by user. Profile saved.");
        return;
      }

      process.stdout.write(`\r  ⏳ Browser open... ${elapsed}s / ${timeout / 1000}s`);
    }
    console.log("\n⏰ Timeout reached. Profile saved with current state.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Auth error: ${msg}`);
  } finally {
    await session.close().catch(() => {});
    console.log("🔒 Browser closed. Profile persisted.\n");
  }
}
