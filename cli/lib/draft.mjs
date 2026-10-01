export const CONDITIONS = ["new", "like_new", "good", "fair", "poor"];

/** @param {Record<string, string | undefined>} facts */
export function makeDraft(facts) {
  const required = ["title", "price", "condition"];
  const missing = required.filter((field) => !facts[field]?.trim());
  if (missing.length) throw new Error(`Required facts missing: ${missing.join(", ")}`);
  if (!/^\d+(?:\.\d{1,2})?$/.test(facts.price.trim())) {
    throw new Error("Price must be a positive amount with up to two decimal places.");
  }
  if (!CONDITIONS.includes(facts.condition)) {
    throw new Error(`Condition must be one of: ${CONDITIONS.join(", ")}`);
  }

  const lines = [facts.title, `Price: ${facts.price}`, `Condition: ${facts.condition}`];
  if (facts.location?.trim()) lines.push(`Pickup: ${facts.location}`);
  if (facts.details?.trim()) lines.push("", facts.details);
  lines.push("", "Draft only — review and post it yourself.");
  return lines.join("\n");
}

/** @param {string[]} args */
export function parseDraftArgs(args) {
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
