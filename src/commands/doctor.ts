import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../domain/config.js";

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

  // Browser profile
  const profilePath = resolve(
    process.env["SHARK_BROWSER_PROFILE"] ?? "~/.shark/browser-profile",
  );
  checks.push({
    name: "Browser profile",
    status: existsSync(profilePath) ? "ok" : "warn",
    detail: existsSync(profilePath)
      ? profilePath
      : `${profilePath} (will be created on first run)`,
  });

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
