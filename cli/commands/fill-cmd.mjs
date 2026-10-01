import { BrowserSession } from "../lib/browser-session.mjs";
import { focusChromeWindow } from "../lib/shark-chrome.mjs";
import { parsePlatform } from "../lib/platforms.mjs";
import { makeDraft, parseDraftArgs } from "../lib/draft.mjs";
import {
  fillFacebookListing,
  fillYad2Listing,
  prepareWhatsAppListing,
} from "../lib/fill-lite.mjs";

/** @param {string[]} args @param {{ platform?: string, cdp?: string, waTo?: string }} opts */
export async function runFill(args, opts) {
  if (!opts.platform) throw new Error("fill requires --platform facebook|whatsapp|yad2");
  const platform = parsePlatform(opts.platform);

  const facts = parseDraftArgs(args);
  if (facts.help) {
    console.log(
      "Usage: shark fill --platform <facebook|whatsapp|yad2> --title ... --price ... --condition ... [--wa-to <chat>]",
    );
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
        : platform === "yad2"
          ? await fillYad2Listing(page, listing)
          : await prepareWhatsAppListing(page, listing, { waTo: opts.waTo });

    await focusChromeWindow();
    console.log("\n--- Draft copy ---\n");
    console.log(draft);
    console.log("\n--- Browser ---\n");
    console.log(JSON.stringify(result, null, 2));
    const stopLine =
      platform === "whatsapp"
        ? "\nStopped before Send. Review the open tab.\n"
        : "\nStopped before Publish/Post. Review the open tab.\n";
    console.log(stopLine);

    if (result.status === "login_required") process.exitCode = 2;
    else if (result.status === "needs_mapping") process.exitCode = 3;
  } finally {
    await session.detach();
  }
}
