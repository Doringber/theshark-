#!/usr/bin/env node
import { Command } from "commander";
import { runSell } from "./commands/sell.js";
import { runDoctor } from "./commands/doctor.js";
import { runAuth } from "./commands/auth.js";
import { runInspect } from "./commands/inspect.js";
import type { PlatformName } from "./domain/config.js";

const program = new Command();

program
  .name("shark")
  .description("Local CLI tool for cross-posting second-hand product listings")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check Node, browser, config, image access, and optional AI credentials")
  .action(async () => {
    await runDoctor();
  });

program
  .command("configure")
  .description("Save platform URLs, language, city, browser profile, AI provider")
  .action(() => {
    console.log("🦈 shark configure — interactive config editor coming soon");
  });

program
  .command("auth")
  .description("Open a platform and let the user log in manually")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .option("--timeout <ms>", "How long to keep browser open (ms)", "300000")
  .option("--auto-close", "Auto-close when login detected")
  .option("--cdp <url>", "Attach to your running Chrome (needs --remote-debugging-port)")
  .action(async (opts: { platform: string; timeout: string; autoClose?: boolean; cdp?: string }) => {
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
  });

program
  .command("inspect")
  .description("Open a platform URL and save a sanitized DOM snapshot")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .option("--url <url>", "Specific URL to inspect (overrides platform default)")
  .option("--output <path>", "Save snapshot to this path")
  .option("--wait <ms>", "Wait time before capturing (ms)", "3000")
  .option("--cdp <url>", "Attach to your running Chrome (needs --remote-debugging-port)")
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
  .description("Run the interactive sale flow (dry-run by default)")
  .requiredOption("--image <paths...>", "One or more product image paths")
  .option("--publish", "Allow final submission (still requires interactive approval)")
  .option("--auto-approve", "Skip interactive prompts (for AI agent / CI use)")
  .option("--dry-run", "Force dry-run (default: true)")
  .option("--no-dry-run", "Override config dryRun — enable real submissions")
  .option("--title <title>", "Product title (skip interactive prompt)")
  .option("--price <price>", "Price in NIS (skip interactive prompt)")
  .option("--description <desc>", "Description (skip interactive prompt)")
  .option("--condition <condition>", "Condition: new, like_new, good, fair, poor")
  .option("--location <location>", "City/area (skip interactive prompt)")
  .option("--category <category>", "Facebook category, e.g. Furniture")
  .option("--groups <names>", "Comma-separated Facebook group names to cross-post to")
  .option("--cdp <url>", "Attach to your running Chrome (needs --remote-debugging-port)")
  .option(
    "--platforms <platforms>",
    "Comma-separated platforms: facebook,whatsapp,yad2",
  )
  .option(
    "--analysis-only <indices>",
    "Comma-separated image indices (0-based) to mark as analysis_only",
  )
  .action(
    async (opts: {
      image: string[];
      publish?: boolean;
      autoApprove?: boolean;
      dryRun?: boolean;
      title?: string;
      price?: string;
      description?: string;
      condition?: string;
      location?: string;
      category?: string;
      groups?: string;
      platforms?: string;
      analysisOnly?: string;
      cdp?: string;
    }) => {
      try {
        await runSell({
          images: opts.image,
          publish: opts.publish ?? false,
          autoApprove: opts.autoApprove ?? false,
          noDryRun: opts.dryRun === false,
          cdpUrl: opts.cdp ?? process.env["SHARK_CDP_URL"],
          title: opts.title,
          price: opts.price ? Number(opts.price) : undefined,
          description: opts.description,
          condition: opts.condition as
            "new" | "like_new" | "good" | "fair" | "poor" | undefined,
          location: opts.location,
          category: opts.category,
          groups: opts.groups?.split(",").map((s) => s.trim()).filter(Boolean),
          platforms: opts.platforms?.split(",").map((s) => s.trim()) as
            Array<"facebook" | "whatsapp" | "yad2"> | undefined,
          analysisOnlyIndices: opts.analysisOnly
            ?.split(",")
            .map((s) => parseInt(s.trim(), 10)),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n💀 ${msg}`);
        process.exitCode = 1;
      }
    },
  );

program.parse();
