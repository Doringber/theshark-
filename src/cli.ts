#!/usr/bin/env node
import { Command } from "commander";
import { runSell } from "./commands/sell.js";
import { runDoctor } from "./commands/doctor.js";

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
  .action((opts: { platform: string }) => {
    console.log(
      `🦈 shark auth --platform ${opts.platform} — manual login flow coming soon`,
    );
  });

program
  .command("inspect")
  .description("Open a platform URL and save a sanitized DOM snapshot")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .action((opts: { platform: string }) => {
    console.log(
      `🦈 shark inspect --platform ${opts.platform} — snapshot tool coming soon`,
    );
  });

program
  .command("sell")
  .description("Run the interactive sale flow (dry-run by default)")
  .requiredOption("--image <paths...>", "One or more product image paths")
  .option("--publish", "Allow final submission (still requires interactive approval)")
  .action(async (opts: { image: string[]; publish?: boolean }) => {
    try {
      await runSell({
        images: opts.image,
        publish: opts.publish ?? false,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n💀 ${msg}`);
      process.exitCode = 1;
    }
  });

program.parse();
