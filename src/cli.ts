#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("shark")
  .description("Local CLI tool for cross-posting second-hand product listings")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check Node, browser, config, image access, and optional AI credentials")
  .action(() => {
    console.log("🦈 shark doctor — not yet implemented (Slice 5)");
  });

program
  .command("configure")
  .description("Save platform URLs, language, city, browser profile, AI provider")
  .action(() => {
    console.log("🦈 shark configure — not yet implemented (Slice 5)");
  });

program
  .command("auth")
  .description("Open a platform and let the user log in manually")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .action(() => {
    console.log("🦈 shark auth — not yet implemented (Slice 3)");
  });

program
  .command("inspect")
  .description("Open a platform URL and save a sanitized DOM snapshot")
  .requiredOption("--platform <name>", "Platform name: facebook, whatsapp, yad2")
  .action(() => {
    console.log("🦈 shark inspect — not yet implemented (Slice 3)");
  });

program
  .command("sell")
  .description("Run the interactive sale flow (dry-run by default)")
  .requiredOption("--image <paths...>", "One or more product image paths")
  .option("--publish", "Allow final submission (still requires interactive approval)")
  .action(() => {
    console.log("🦈 shark sell — not yet implemented (Slice 5)");
  });

program.parse();
