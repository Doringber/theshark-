import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../domain/config.js";
import { LLM_PROVIDERS, llmKeyStatus } from "../services/llm-copywriter.js";
import { CHROME_BIN, SHARK_CDP_URL, SHARK_CHROME_DIR } from "../browser/session.js";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export async function runDoctor(): Promise<void> {
  console.log("\n🦈 Shark Doctor\n");
  const checks: CheckResult[] = [];

  // Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  checks.push({
    name: "Node.js",
    status: major >= 20 ? "ok" : "fail",
    detail: `${nodeVersion}${major < 20 ? " (requires 20+)" : ""}`,
  });

  // Playwright / Chromium
  try {
    const pw = execSync("npx playwright --version 2>&1", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    checks.push({ name: "Playwright", status: "ok", detail: pw });
  } catch {
    checks.push({
      name: "Playwright",
      status: "fail",
      detail: "Not installed — run: npx playwright install chromium",
    });
  }

  // Config file
  const configPath = resolve("shark.config.json");
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(await readFile(configPath, "utf-8"));
      const result = loadConfig(raw);
      if (result.valid) {
        const platforms = Object.entries(result.config.platforms)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k);
        checks.push({
          name: "Config",
          status: "ok",
          detail: `shark.config.json — platforms: ${platforms.join(", ")}`,
        });
      } else {
        checks.push({
          name: "Config",
          status: "warn",
          detail: `Validation errors: ${result.errors.join("; ")}`,
        });
      }
    } catch {
      checks.push({
        name: "Config",
        status: "warn",
        detail: "shark.config.json exists but could not be parsed",
      });
    }
  } else {
    checks.push({
      name: "Config",
      status: "warn",
      detail: "shark.config.json not found — using defaults",
    });
  }

  // LLM copywriter keys — presence only, never the value
  const llmPresent = LLM_PROVIDERS.filter((p) => llmKeyStatus(p).present);
  checks.push({
    name: "LLM keys",
    status: "ok",
    detail:
      llmPresent.length > 0
        ? `${llmPresent.map((p) => `${p} (${llmKeyStatus(p).envVar})`).join(", ")} — optional, used only with --llm`
        : "none set — optional; export OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY to use --llm",
  });

  // Shared Shark Chrome (attach target)
  const chromeInstalled = existsSync(CHROME_BIN);
  let cdpUp: boolean;
  try {
    const res = await fetch(`${SHARK_CDP_URL}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    cdpUp = res.ok;
  } catch {
    cdpUp = false;
  }
  checks.push({
    name: "Google Chrome",
    status: chromeInstalled ? "ok" : "fail",
    detail: chromeInstalled
      ? CHROME_BIN
      : "Not found at /Applications — install Google Chrome",
  });
  checks.push({
    name: "Shark Chrome",
    status: cdpUp ? "ok" : "warn",
    detail: cdpUp
      ? `running (${SHARK_CDP_URL}), profile ${SHARK_CHROME_DIR}`
      : `not running — starts automatically on the next command (profile ${SHARK_CHROME_DIR})`,
  });
  if (cdpUp) {
    // Which sites already have a session? Cheap check: does a tab exist for them.
    try {
      const tabs = (await (await fetch(`${SHARK_CDP_URL}/json`)).json()) as Array<{
        url: string;
      }>;
      const open = ["facebook.com", "web.whatsapp.com", "yad2.co.il"].filter((h) =>
        tabs.some((t) => t.url.includes(h)),
      );
      checks.push({
        name: "Open site tabs",
        status: "ok",
        detail: open.length
          ? open.join(", ")
          : "none (run: shark auth --platform <name>)",
      });
    } catch {
      /* ignore */
    }
  }

  // Print results
  const icons = { ok: "✅", warn: "⚠️ ", fail: "❌" };
  for (const check of checks) {
    console.log(`  ${icons[check.status]} ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((c) => c.status === "fail");
  console.log("");
  if (failed.length > 0) {
    console.log(`❌ ${failed.length} check(s) failed — fix before running shark sell`);
    process.exitCode = 1;
  } else {
    console.log("🦈 All checks passed — ready to sell!");
  }
}
