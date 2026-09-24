#!/usr/bin/env node
import { Command } from "commander";
import { resolveSellImagePaths, runSell } from "./commands/sell.js";
import { runWSend } from "./commands/wsend.js";
import { runDoctor } from "./commands/doctor.js";
import { runAuth } from "./commands/auth.js";
import { runInspect } from "./commands/inspect.js";
import { runResume } from "./commands/resume.js";
import { runStatus } from "./commands/status.js";
import { runConfigure } from "./commands/configure.js";
import type { PlatformName } from "./domain/config.js";

const program = new Command();

program
  .name("shark")
  .description("Local CLI tool for cross-posting second-hand product listings")
  .version("0.2.0");

program
  .command("doctor")
  .description("Check Node, browser, config, image access, and optional AI credentials")
  .action(async () => {
    await runDoctor();
  });

program
  .command("configure")
  .description("Remember non-sensitive defaults (language, city, pickup, platforms)")
  .option("--language <lang>", "he, en, or both")
  .option("--city <city>", "Default city / area")
  .option("--pickup <text>", "Pickup preference")
  .option("--platforms <list>", "Comma-separated default platforms")
  .option("--wa-groups <list>", "Preferred WhatsApp selling groups")
  .option("--browser-profile <path>", "Browser profile path")
  .action(
    async (opts: {
      language?: string;
      city?: string;
      pickup?: string;
      platforms?: string;
      waGroups?: string;
      browserProfile?: string;
    }) => {
      try {
        await runConfigure({
          language: opts.language as "he" | "en" | "both" | undefined,
          city: opts.city,
          pickup: opts.pickup,
          platforms: opts.platforms?.split(",").map((s) => s.trim()) as
            PlatformName[] | undefined,
          waGroups: opts.waGroups
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          browserProfile: opts.browserProfile,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("browser")
  .description(
    "Open (or focus) the shared Shark Chrome window — log in to your accounts there once",
  )
  .option("--url <url>", "Page to open in a new tab")
  .action(async (opts: { url?: string }) => {
    const { ensureSharkChrome, SHARK_CHROME_DIR } =
      await import("./browser/session.js");
    const cdp = await ensureSharkChrome();
    if (!cdp) {
      console.error("💀 Google Chrome not found at /Applications/Google Chrome.app");
      process.exitCode = 1;
      return;
    }
    if (opts.url) {
      await fetch(`${cdp}/json/new?${encodeURIComponent(opts.url)}`, {
        method: "PUT",
      }).catch(() => {});
    }
    const { execFile } = await import("node:child_process");
    execFile("osascript", ["-e", 'tell application "Google Chrome" to activate']);
    console.log(`🦈 Shark Chrome is running (${cdp})\n   Profile: ${SHARK_CHROME_DIR}`);
  });

program
  .command("auth")
  .description("Open a platform and let the user log in manually")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .option("--timeout <ms>", "How long to keep browser open (ms)", "300000")
  .option("--auto-close", "Auto-close when login detected")
  .option(
    "--cdp <url>",
    'CDP URL to attach to (default: shared Shark Chrome on 127.0.0.1:9333; "none" = own profile)',
  )
  .action(
    async (opts: {
      platform: string;
      timeout: string;
      autoClose?: boolean;
      cdp?: string;
    }) => {
      try {
        await runAuth({
          platform: opts.platform as PlatformName,
          timeout: parseInt(opts.timeout, 10),
          autoClose: opts.autoClose ?? true,
          cdpUrl: opts.cdp ?? process.env["SHARK_CDP_URL"],
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("inspect")
  .description("Open a platform URL and save a sanitized DOM snapshot")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .option("--url <url>", "Specific URL to inspect (overrides platform default)")
  .option("--output <path>", "Save snapshot to this path")
  .option("--wait <ms>", "Wait time before capturing (ms)", "3000")
  .option(
    "--cdp <url>",
    'CDP URL to attach to (default: shared Shark Chrome on 127.0.0.1:9333; "none" = own profile)',
  )
  .action(
    async (opts: {
      platform: string;
      url?: string;
      output?: string;
      wait: string;
      cdp?: string;
    }) => {
      try {
        await runInspect({
          platform: opts.platform as PlatformName,
          url: opts.url,
          output: opts.output,
          wait: parseInt(opts.wait, 10),
          cdpUrl: opts.cdp ?? process.env["SHARK_CDP_URL"],
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("sell")
  .description("Prepare a second-hand listing (dry-run drafts by default)")
  .argument("[sources...]", "Image folder or image files")
  .option("--image <paths...>", "One or more product image paths")
  .option("--publish", "Allow final submission (still requires interactive approval)")
  .option("--dry-run", "Force dry-run (default: true)")
  .option("--no-dry-run", "Override config dryRun — enable real submissions")
  .option("--title <title>", "Product title (skip interactive prompt)")
  .option("--price <price>", "Price in NIS (skip interactive prompt)")
  .option("--description <desc>", "Description (skip interactive prompt)")
  .option("--condition <condition>", "Condition: new, like_new, good, fair, poor")
  .option("--location <location>", "City/area (skip interactive prompt)")
  .option("--category <category>", "Facebook category, e.g. Furniture")
  .option("--groups <names>", "Comma-separated Facebook group names to cross-post to")
  .option(
    "--yad2-type <name>",
    'Yad2 product type for the autocomplete, e.g. "מחשב נייד"',
  )
  .option("--yad2-brand <name>", "Yad2 manufacturer as listed there, e.g. Apple")
  .option("--wa-to <names>", "Comma-separated WhatsApp chat/group names to send to")
  .option(
    "--draft-only",
    "Fill the form and leave the tab open for review — never submit",
  )
  .option(
    "--cdp <url>",
    'CDP URL to attach to (default: shared Shark Chrome on 127.0.0.1:9333; "none" = own profile)',
  )
  .option(
    "--platforms <platforms>",
    "Comma-separated platforms: facebook,whatsapp,yad2",
  )
  .option(
    "--analysis-only <indices>",
    "Comma-separated image indices (0-based) to mark as analysis_only",
  )
  .option(
    "--non-interactive",
    "Skip the fact interview (all facts from flags). Final Publish/Send approvals still prompt.",
  )
  .action(
    async (
      sources: string[],
      opts: {
        nonInteractive?: boolean;
        image?: string[];
        publish?: boolean;
        dryRun?: boolean;
        title?: string;
        price?: string;
        description?: string;
        condition?: string;
        location?: string;
        category?: string;
        groups?: string;
        yad2Type?: string;
        yad2Brand?: string;
        waTo?: string;
        draftOnly?: boolean;
        platforms?: string;
        analysisOnly?: string;
        cdp?: string;
      },
    ) => {
      try {
        await runSell({
          images: resolveSellImagePaths(sources, opts.image),
          publish: opts.publish ?? false,
          noDryRun: opts.dryRun === false,
          cdpUrl: opts.cdp ?? process.env["SHARK_CDP_URL"],
          title: opts.title,
          price: opts.price ? Number(opts.price) : undefined,
          description: opts.description,
          condition: opts.condition as
            "new" | "like_new" | "good" | "fair" | "poor" | undefined,
          location: opts.location,
          category: opts.category,
          groups: opts.groups
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          yad2Type: opts.yad2Type,
          yad2Brand: opts.yad2Brand,
          waTo: opts.waTo
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          draftOnly: opts.draftOnly ?? false,
          platforms: opts.platforms?.split(",").map((s) => s.trim()) as
            Array<"facebook" | "whatsapp" | "yad2"> | undefined,
          analysisOnlyIndices: opts.analysisOnly
            ?.split(",")
            .map((s) => parseInt(s.trim(), 10)),
          nonInteractive: opts.nonInteractive ?? false,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("resume")
  .description("Resume an interrupted sell run from its checkpoint")
  .argument("<run-id>", "Run ID printed by shark sell or shark status")
  .option("--publish", "Enable the approval path for remaining final actions")
  .option("--no-dry-run", "Override config dryRun")
  .option("--draft-only", "Prepare remaining drafts but never submit")
  .option("--cdp <url>", "CDP URL to attach to")
  .action(
    async (
      runId: string,
      opts: {
        publish?: boolean;
        dryRun?: boolean;
        draftOnly?: boolean;
        cdp?: string;
      },
    ) => {
      try {
        await runResume({
          runId,
          publish: opts.publish ?? false,
          noDryRun: opts.dryRun === false,
          draftOnly: opts.draftOnly,
          cdpUrl: opts.cdp ?? process.env["SHARK_CDP_URL"],
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("status")
  .description("Show a concise per-platform status for a sell run")
  .argument("<run-id>", "Run ID")
  .action(async (runId: string) => {
    try {
      await runStatus(runId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n💀 ${msg}`);
      process.exitCode = 1;
    }
  });

program
  .command("wsend")
  .description(
    "Send a WhatsApp message via your already-open Chrome (no Shark browser)",
  )
  .requiredOption("--to <phone>", "Recipient phone (05x... or international)")
  .option("--text <text>", "Message text")
  .option("--image <path>", "Image to attach (.jpg/.png)")
  .option("--wait <seconds>", "Seconds to wait for chat load", "12")
  .action(async (opts: { to: string; text?: string; image?: string; wait: string }) => {
    try {
      const result = await runWSend({
        to: opts.to,
        text: opts.text,
        image: opts.image,
        waitSeconds: parseInt(opts.wait, 10),
      });
      console.log(`\n⚠️ ${result.status} — ${result.message}\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n💀 ${msg}`);
      process.exitCode = 1;
    }
  });

program.parse();
