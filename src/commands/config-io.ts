import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, type SharkConfig } from "../domain/config.js";

export function configPath(): string {
  return resolve("shark.config.json");
}

export async function resolveConfig(): Promise<SharkConfig> {
  const path = configPath();
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(await readFile(path, "utf-8"));
      const result = loadConfig(raw, { allowLocalhost: false });
      if (result.valid) return result.config;
      console.warn(
        "⚠️  Config validation errors, using defaults:",
        result.errors.join(", "),
      );
    } catch {
      console.warn("⚠️  Could not parse shark.config.json, using defaults");
    }
  }
  const defaults = loadConfig({});
  if (!defaults.valid) {
    throw new Error("Default config is invalid — this should never happen");
  }
  return defaults.config;
}

const FORBIDDEN_CONFIG_KEYS = [
  "password",
  "token",
  "cookie",
  "captcha",
  "approval",
  "secret",
];

export async function saveConfig(config: SharkConfig): Promise<void> {
  const json = JSON.stringify(config, null, 2);
  const lower = json.toLowerCase();
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    if (lower.includes(`"${key}"`)) {
      throw new Error(`Refusing to persist forbidden config field: ${key}`);
    }
  }
  await writeFile(configPath(), `${json}\n`, "utf-8");
}
