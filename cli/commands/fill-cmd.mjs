import { BrowserSession } from "../lib/browser-session.mjs";
import { focusChromeWindow } from "../lib/shark-chrome.mjs";
import { parsePlatform } from "../lib/platforms.mjs";
import { makeDraft, parseDraftArgs } from "../lib/draft.mjs";
import { fillFacebookListing, fillYad2Listing } from "../lib/fill-lite.mjs";

/** @param {string[]} args @param {{ platform?: string, cdp?: string }} opts */
export async function runFill(args, opts) {
  if (!opts.platform) throw new Error("fill requires --platform facebook|yad2");
  const platform = parsePlatform(opts.platform);
  if (platform === "whatsapp") {
    throw new Error("Use shark browser --url https://web.whatsapp.com and pick the chat manually.");
  }

  const facts = parseDraftArgs(args);
  if (facts.help) {
    console.log("Usage: shark fill --platform <facebook|yad2> --title ... --price ... --condition ...");
    return;
  }

  const draft = makeDraft(facts);
  const listing = {
    title: facts.title.trim(),
    price: facts.price.trim(),
    condition: facts.condition.trim(),
    location: facts.location?.trim(),
    details: facts.details?.trim(),
  };

  const session = new BrowserSession({ cdpUrl: opts.cdp ?? BrowserSession.defaultCdpUrl() });
  try {
    const page = await session.getPage();
    const result =
      platform === "facebook"
        ? await fillFacebookListing(page, listing)
        : await fillYad2Listing(page, listing);

    await focusChromeWindow();
    console.log("\n--- Draft copy ---\n");
    console.log(draft);
    console.log("\n--- Browser ---\n");
    console.log(JSON.stringify(result, null, 2));
    console.log("\nStopped before Publish/Post. Review the open tab.\n");

    if (result.status === "login_required") process.exitCode = 2;
    else if (result.status === "needs_mapping") process.exitCode = 3;
  } finally {
    await session.detach();
  }
}
