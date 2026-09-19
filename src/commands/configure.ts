import { input, checkbox, select } from "@inquirer/prompts";
import { resolveConfig, saveConfig } from "./config-io.js";
import type { PlatformName, SharkConfig } from "../domain/config.js";

export interface ConfigureOptions {
  language?: "he" | "en" | "both";
  city?: string;
  pickup?: string;
  platforms?: PlatformName[];
  waGroups?: string[];
  browserProfile?: string;
  interactive?: boolean;
}

export async function runConfigure(
  options: ConfigureOptions = {},
): Promise<SharkConfig> {
  const current = await resolveConfig();
  const interactive = options.interactive ?? !hasAnyFlag(options);

  let next: SharkConfig;

  if (interactive) {
    const language = await select({
      message: "Preferred language",
      choices: [
        { name: "Hebrew", value: "he" as const },
        { name: "English", value: "en" as const },
        { name: "Both", value: "both" as const },
      ],
      default: current.language,
    });
    const city = await input({
      message: "City / area",
      default: current.seller.city ?? "",
    });
    const pickup = await input({
      message: "Pickup preference",
      default: current.pickupPreference ?? "איסוף עצמי",
    });
    const platforms = await checkbox({
      message: "Default platforms",
      choices: [
        { name: "Facebook Marketplace", value: "facebook" as const, checked: true },
        { name: "WhatsApp", value: "whatsapp" as const, checked: true },
        { name: "Yad2", value: "yad2" as const, checked: true },
      ],
    });
    const waGroups = await input({
      message: "Preferred WhatsApp selling groups (comma-separated)",
      default: (current.whatsappGroups ?? []).join(", "),
    });
    const browserProfile = await input({
      message: "Browser profile path",
      default: current.browserProfilePath,
    });
    next = applyUpdates(current, {
      language,
      city,
      pickup,
      platforms: platforms.length ? platforms : current.defaultPlatforms,
      waGroups: waGroups
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      browserProfile,
    });
  } else {
    next = applyUpdates(current, options);
  }

  await saveConfig(next);
  console.log("🦈 Saved non-sensitive defaults to shark.config.json");
  console.log("   Approvals, passwords, CAPTCHA data, and cookies are never stored.");
  return next;
}

function hasAnyFlag(options: ConfigureOptions): boolean {
  return Boolean(
    options.language ||
    options.city ||
    options.pickup ||
    options.platforms ||
    options.waGroups ||
    options.browserProfile,
  );
}

function applyUpdates(current: SharkConfig, options: ConfigureOptions): SharkConfig {
  return {
    ...current,
    language: options.language ?? current.language,
    pickupPreference: options.pickup ?? current.pickupPreference,
    browserProfilePath: options.browserProfile ?? current.browserProfilePath,
    defaultPlatforms: options.platforms ?? current.defaultPlatforms,
    whatsappGroups: options.waGroups ?? current.whatsappGroups,
    seller: {
      ...current.seller,
      city: options.city ?? current.seller.city,
    },
  };
}
