#!/usr/bin/env node

const CONDITIONS = ["new", "like_new", "good", "fair", "poor"];

function help() {
  console.log(`Shark — prepare a second-hand listing draft

Usage:
  shark draft --title <text> --price <amount> --condition <condition> [options]

Required:
  --title <text>          Item title
  --price <amount>        Asking price
  --condition <condition> ${CONDITIONS.join(" | ")}

Options:
  --location <text>       Pickup area
  --details <text>        Description using facts you provide
  --help                  Show this help

This CLI only prints a draft. It never contacts a marketplace or sends it.`);
}

function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--help") return { help: true };
    const value = args[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    const field = key.slice(2);
    if (!["title", "price", "condition", "location", "details"].includes(field)) {
      throw new Error(`Unknown option: ${key}`);
    }
    values[field] = value;
    i += 1;
  }
  return values;
}

function makeDraft(facts) {
  const required = ["title", "price", "condition"];
  const missing = required.filter((field) => !facts[field]?.trim());
  if (missing.length) throw new Error(`Required facts missing: ${missing.join(", ")}`);
  if (!/^\d+(?:\.\d{1,2})?$/.test(facts.price)) {
    throw new Error("Price must be a positive amount with up to two decimal places.");
  }
  if (!CONDITIONS.includes(facts.condition)) {
    throw new Error(`Condition must be one of: ${CONDITIONS.join(", ")}`);
  }

  const lines = [facts.title, `Price: ${facts.price}`, `Condition: ${facts.condition}`];
  if (facts.location) lines.push(`Pickup: ${facts.location}`);
  if (facts.details) lines.push("", facts.details);
  lines.push("", "Draft only — review and post it yourself.");
  return lines.join("\n");
}

const [command, ...args] = process.argv.slice(2);
if (command === "--help" || command === "-h" || !command) {
  help();
} else if (command !== "draft") {
  console.error(`Unknown command: ${command}\n`);
  help();
  process.exitCode = 2;
} else {
  try {
    const facts = parseArgs(args);
    if (facts.help) help();
    else console.log(makeDraft(facts));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid listing facts");
    process.exitCode = 2;
  }
}
