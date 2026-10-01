#!/usr/bin/env node

import { CONDITIONS, makeDraft, parseDraftArgs } from "./lib/draft.mjs";
import { runBrowser } from "./commands/browser-cmd.mjs";
import { runAuth } from "./commands/auth-cmd.mjs";
import { runCheck } from "./commands/check-cmd.mjs";
import { runFill } from "./commands/fill-cmd.mjs";

function help() {
  console.log(`Shark — prepare listings and open the shared Shark Chrome profile

Usage:
  shark draft --title <text> --price <amount> --condition <condition> [options]
  shark browser [--url <https-url>]
  shark auth --platform <facebook|whatsapp|yad2>
  shark check --platform <facebook|whatsapp|yad2>
  shark fill --platform <facebook|whatsapp|yad2> --title ... --price ... --condition ... [options]

Fill options:
  --wa-to <chat name>     WhatsApp only: exact sidebar title; pastes draft in composer (never Send)

Draft options:
  --location <text>       Pickup area
  --details <text>        Description using facts you provide

Environment:
  SHARK_CDP_URL           CDP endpoint (default http://127.0.0.1:9333)
  SHARK_CHROME_BIN        Path to Google Chrome

Conditions: ${CONDITIONS.join(" | ")}

The draft command only prints text. Browser commands attach to Shark Chrome
(~/.shark/chrome) so you log in once manually; fill stops before publishing.`);
}

/** @param {string[]} argv */
function parseGlobalOpts(argv) {
  const rest = [];
  /** @type {{ platform?: string, url?: string, cdp?: string, waTo?: string }} */
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--platform") {
      opts.platform = argv[i + 1];
      i += 1;
    } else if (token === "--wa-to") {
      opts.waTo = argv[i + 1];
      i += 1;
    } else if (token === "--url") {
      opts.url = argv[i + 1];
      i += 1;
    } else if (token === "--cdp") {
      opts.cdp = argv[i + 1];
      i += 1;
    } else {
      rest.push(token);
    }
  }
  return { opts, rest };
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  if (command === "--help" || command === "-h" || !command) {
    help();
    return;
  }

  const { opts, rest } = parseGlobalOpts(rawArgs);

  try {
    if (command === "draft") {
      const facts = parseDraftArgs(rest);
      if (facts.help) help();
      else console.log(makeDraft(facts));
      return;
    }
    if (command === "browser") {
      await runBrowser({ url: opts.url });
      return;
    }
    if (command === "auth") {
      if (!opts.platform) throw new Error("auth requires --platform facebook|whatsapp|yad2");
      await runAuth({ platform: opts.platform, cdp: opts.cdp });
      return;
    }
    if (command === "check") {
      if (!opts.platform) throw new Error("check requires --platform facebook|whatsapp|yad2");
      await runCheck({ platform: opts.platform, cdp: opts.cdp });
      return;
    }
    if (command === "fill") {
      await runFill(rest, { platform: opts.platform, cdp: opts.cdp, waTo: opts.waTo });
      return;
    }

    console.error(`Unknown command: ${command}\n`);
    help();
    process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid input");
    process.exitCode = 2;
  }
}

await main();
