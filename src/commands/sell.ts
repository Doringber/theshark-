import { confirm, input, select, checkbox } from "@inquirer/prompts";
import { basename, resolve } from "node:path";

import { type ProductImage, getUploadableImages } from "../domain/schemas.js";
import { collectImageSources, validateImages } from "../services/image-sources.js";
import { type SharkConfig, type PlatformName } from "../domain/config.js";
import { RunStore } from "../services/run-store.js";
import { createHumanNotifier } from "../services/human-notify.js";
import { BrowserSession } from "../browser/session.js";
import { FacebookMarketplaceAdapter } from "../platforms/facebook-marketplace.js";
import { WhatsAppWebAdapter } from "../platforms/whatsapp-web.js";
import { Yad2Adapter } from "../platforms/yad2.js";
import type { SubmissionResult } from "../platforms/platform-adapter.js";
import {
  runSellFlow,
  type SellFlowOptions,
} from "../orchestration/sell-orchestrator.js";
import { wrapSession } from "../orchestration/browser-port.js";
import { resolveConfig } from "./config-io.js";
import { writeListingCopy, type LlmProviderName } from "../services/llm-copywriter.js";
import {
  type HighValueField,
  type ListingFacts,
  missingHighValueQuestions,
  proposeListing,
} from "../services/listing-proposal.js";
import {
  describePlatformDifferences,
  factsFromFlags,
} from "../services/listing-interview.js";

export { validateImages };

export interface SellOptions {
  images: string[];
  publish: boolean;
  title?: string;
  price?: number;
  description?: string;
  condition?: "new" | "like_new" | "good" | "fair" | "poor";
  location?: string;
  category?: string;
  groups?: string[];
  platforms?: Array<"facebook" | "whatsapp" | "yad2">;
  analysisOnlyIndices?: number[];
  noDryRun?: boolean;
  cdpUrl?: string;
  draftOnly?: boolean;
  yad2Type?: string;
  yad2Brand?: string;
  waTo?: string[];
  defects?: string;
  pickupDelivery?: string;
  /**
   * `--non-interactive`: skip the fact interview — every listing fact must come
   * from flags. Final Publish/Send approvals are NOT affected and still prompt;
   * without a TTY they fail closed (nothing is submitted).
   */
  nonInteractive?: boolean;
  /** LLM copywriter: rewrite the description from YOUR facts (never adds facts). */
  llm?: LlmProviderName;
  llmModel?: string;
}

/**
 * If an LLM provider is selected (flag or config), write the description from the
 * user's facts. On any failure the user's own text is kept and the reason shown.
 */
async function applyLlmCopy(
  facts: ListingFacts,
  config: SharkConfig,
  options: SellOptions,
): Promise<ListingFacts> {
  const provider = options.llm ?? config.llm.provider;
  if (!provider) return facts;
  if (!facts.title || facts.price === undefined) return facts;
  const result = await writeListingCopy(
    {
      title: facts.title,
      price: facts.price,
      condition: facts.condition,
      location: facts.location,
      defects: facts.defects,
      pickupDelivery: facts.pickupDelivery,
      description: facts.description,
      category: facts.category,
      language: config.language,
    },
    {
      provider,
      model: options.llmModel ?? config.llm.model,
      baseUrl: config.llm.baseUrl,
    },
  );
  if (!result.ok) {
    console.log(`⚠️  LLM copy skipped — ${result.reason}. Keeping your text.`);
    return facts;
  }
  console.log(
    `✍️  Description written by ${result.provider}/${result.model} from your facts only\n`,
  );
  return { ...facts, description: result.text };
}

const NON_INTERACTIVE_REQUIRED_FLAGS = [
  "title",
  "price",
  "condition",
  "location",
  "platforms",
] as const;

/** `--non-interactive` may not fill gaps with guesses — every fact has to be on the command line. */
export function assertFlagsCompleteForNonInteractive(options: SellOptions): void {
  const missing = NON_INTERACTIVE_REQUIRED_FLAGS.filter((key) => {
    const value = options[key];
    return (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    );
  });
  if (missing.length > 0) {
    throw new Error(
      `--non-interactive requires these flags so Shark never invents facts: ${missing
        .map((m) => `--${m}`)
        .join(", ")}`,
    );
  }
}

export interface SellResult {
  runId: string;
  listingId: string;
  results: SubmissionResult[];
  dryRun: boolean;
}

function showPreview(
  facts: ListingFacts,
  images: ProductImage[],
  extras: { category?: string; defects?: string; pickupDelivery?: string },
): void {
  const uploadable = getUploadableImages(images);
  console.log("\n" + "═".repeat(50));
  console.log("📋 MASTER LISTING");
  console.log("═".repeat(50));
  console.log(`  Title:       ${facts.title ?? "(missing)"}`);
  console.log(
    `  Price:       ${facts.price !== undefined ? `₪${facts.price}` : "(missing)"}`,
  );
  console.log(`  Condition:   ${facts.condition ?? "(missing)"}`);
  console.log(`  Location:    ${facts.location ?? "(missing)"}`);
  console.log(`  Description: ${facts.description ?? "(missing)"}`);
  if (extras.category) console.log(`  Category:    ${extras.category}`);
  if (extras.defects) console.log(`  Defects:     ${extras.defects}`);
  if (extras.pickupDelivery) console.log(`  Pickup:      ${extras.pickupDelivery}`);
  console.log(`  Images:      ${uploadable.length} approved for upload`);
  for (const img of images) {
    const mark = img.uploadState === "approved_for_upload" ? "upload" : img.uploadState;
    console.log(`               [${img.order}] ${basename(img.path)} (${mark})`);
  }
  console.log("═".repeat(50) + "\n");
}

async function askField(
  field: HighValueField,
  current: ListingFacts,
): Promise<ListingFacts> {
  switch (field) {
    case "title": {
      const title = await input({
        message: "Product title (Hebrew is fine):",
        default: current.title,
        validate: (v) => (v.trim().length > 0 ? true : "Title is required"),
      });
      return { ...current, title: title.trim(), hebrewTitle: title.trim() };
    }
    case "price": {
      const priceStr = await input({
        message: "Price (₪):",
        default: current.price !== undefined ? String(current.price) : undefined,
        validate: (v) => {
          const n = Number(v);
          return !isNaN(n) && n > 0 ? true : "Enter a positive number";
        },
      });
      return { ...current, price: Number(priceStr) };
    }
    case "description": {
      const description = await input({
        message: "Description:",
        default: current.description,
        validate: (v) => (v.trim().length > 0 ? true : "Description is required"),
      });
      return { ...current, description: description.trim() };
    }
    case "condition": {
      const condition = await select({
        message: "Condition:",
        choices: [
          { name: "New", value: "new" as const },
          { name: "Like new", value: "like_new" as const },
          { name: "Good", value: "good" as const },
          { name: "Fair", value: "fair" as const },
          { name: "Poor", value: "poor" as const },
        ],
        default: current.condition,
      });
      return { ...current, condition };
    }
    case "location": {
      const location = await input({
        message: "City / area:",
        default: current.location,
        validate: (v) => (v.trim().length > 0 ? true : "Location is required"),
      });
      return { ...current, location: location.trim() };
    }
    case "defects": {
      const defects = await input({
        message: "Known defects (or אין):",
        default: current.defects ?? "אין",
      });
      return { ...current, defects: defects.trim() };
    }
    case "pickupDelivery": {
      const pickupDelivery = await input({
        message: "Pickup or delivery:",
        default: current.pickupDelivery ?? "איסוף עצמי",
      });
      return { ...current, pickupDelivery: pickupDelivery.trim() };
    }
  }
}

async function askMissingFacts(
  facts: ListingFacts,
  config: SharkConfig,
): Promise<ListingFacts> {
  let next = { ...facts };
  for (const field of missingHighValueQuestions(next, config)) {
    next = await askField(field, next);
  }
  return next;
}

async function excludePhoto(images: ProductImage[]): Promise<number | undefined> {
  const uploadable = images.filter((img) => img.uploadState === "approved_for_upload");
  if (uploadable.length <= 1) {
    console.log("At least one uploadable photo is required.");
    return undefined;
  }
  const chosen = await select({
    message: "Which photo should stay local-only (not uploaded)?",
    choices: uploadable.map((img) => ({
      name: `${img.order}  ${basename(img.path)}`,
      value: img.order,
    })),
  });
  const img = images.find((item) => item.order === chosen);
  if (img) img.uploadState = "analysis_only";
  return chosen;
}

async function selectPlatforms(config: SharkConfig): Promise<PlatformName[]> {
  const defaults = new Set(
    config.defaultPlatforms ??
      (["facebook", "whatsapp", "yad2"] as PlatformName[]).filter(
        (p) => config.platforms[p].enabled,
      ),
  );
  const available: { name: string; value: PlatformName; checked: boolean }[] = [];
  if (config.platforms.facebook.enabled) {
    available.push({
      name: "Facebook Marketplace",
      value: "facebook",
      checked: defaults.has("facebook"),
    });
  }
  if (config.platforms.whatsapp.enabled) {
    available.push({
      name: "WhatsApp",
      value: "whatsapp",
      checked: defaults.has("whatsapp"),
    });
  }
  if (config.platforms.yad2.enabled) {
    available.push({
      name: "Yad2",
      value: "yad2",
      checked: defaults.has("yad2"),
    });
  }
  if (available.length === 0) return [];
  return checkbox({
    message: "Prepare drafts on which platforms?",
    choices: available,
  });
}

async function interviewListing(
  images: ProductImage[],
  config: SharkConfig,
  options: SellOptions,
): Promise<
  | { cancelled: true }
  | {
      cancelled: false;
      facts: ListingFacts;
      analysisOnlyIndices: number[];
    }
> {
  console.log("\n🦈 Sell an item\n");
  console.log("Shark will not invent a name, price, or condition from the photos.\n");

  let facts = factsFromFlags(
    {
      title: options.title,
      description: options.description,
      condition: options.condition,
      price: options.price,
      location: options.location,
      category: options.category,
      defects: options.defects,
      pickupDelivery: options.pickupDelivery,
    },
    config,
  );
  facts = factsFromFlags(proposeListing({ images, config, provided: facts }), config);
  facts = await askMissingFacts(facts, config);
  facts = await applyLlmCopy(facts, config, options);

  while (true) {
    const proposal = proposeListing({ images, config, provided: facts });
    showPreview(proposal, images, proposal);
    const action = await select({
      message: "What next?",
      choices: [
        { name: "Approve this listing", value: "approve" as const },
        { name: "Edit a field", value: "edit" as const },
        { name: "Regenerate (will not invent facts)", value: "regenerate" as const },
        { name: "Exclude an unsafe photo", value: "exclude" as const },
        { name: "Cancel", value: "cancel" as const },
      ],
    });
    if (action === "approve") {
      return {
        cancelled: false,
        facts: proposal,
        analysisOnlyIndices: images
          .filter((img) => img.uploadState !== "approved_for_upload")
          .map((img) => img.order),
      };
    }
    if (action === "cancel") return { cancelled: true };
    if (action === "regenerate") {
      if (options.llm ?? config.llm.provider) {
        facts = await applyLlmCopy(
          await askMissingFacts(proposal, config),
          config,
          options,
        );
        continue;
      }
      console.log(
        "Shark cannot invent product facts from photos. Re-asking missing fields only. " +
          "(Tip: --llm openai|anthropic|gemini|codex writes the description from your facts.)",
      );
      facts = await askMissingFacts(proposal, config);
      continue;
    }
    if (action === "exclude") {
      await excludePhoto(images);
      continue;
    }
    const field = await select({
      message: "Edit which field?",
      choices: [
        { name: "Title", value: "title" as const },
        { name: "Price", value: "price" as const },
        { name: "Description", value: "description" as const },
        { name: "Condition", value: "condition" as const },
        { name: "City / area", value: "location" as const },
        { name: "Defects", value: "defects" as const },
        { name: "Pickup / delivery", value: "pickupDelivery" as const },
      ],
    });
    facts = await askField(field, proposal);
  }
}

export async function runSell(options: SellOptions): Promise<SellResult> {
  const { images: imagePaths, publish } = options;

  console.log("🔍 Validating images...");
  const imageResult = validateImages(imagePaths);
  if (!imageResult.valid) {
    console.error("❌ Image validation failed:");
    for (const err of imageResult.errors) {
      console.error(`   • ${err}`);
    }
    throw new Error("Image validation failed");
  }

  if (options.analysisOnlyIndices && options.analysisOnlyIndices.length > 0) {
    for (const idx of options.analysisOnlyIndices) {
      const img = imageResult.images[idx];
      if (img) {
        img.uploadState = "analysis_only";
        console.log(
          `  ⚠️  Image [${idx}] marked as analysis_only (contains sensitive data)`,
        );
      }
    }
  }

  const uploadable = getUploadableImages(imageResult.images);
  console.log(
    `✅ ${imageResult.images.length} image(s) validated, ${uploadable.length} approved for upload\n`,
  );
  if (uploadable.length === 0) {
    throw new Error(
      "No images approved for upload — all marked analysis_only or replace_required",
    );
  }

  const config = await resolveConfig();
  const nonInteractive = options.nonInteractive === true;
  if (nonInteractive) assertFlagsCompleteForNonInteractive(options);

  let facts: ListingFacts;
  let analysisOnlyIndices: number[];
  if (nonInteractive) {
    facts = factsFromFlags(
      proposeListing({
        images: imageResult.images,
        config,
        provided: factsFromFlags(
          {
            title: options.title,
            description: options.description,
            condition: options.condition,
            price: options.price,
            location: options.location,
            category: options.category,
            defects: options.defects,
            pickupDelivery: options.pickupDelivery,
          },
          config,
        ),
      }),
      config,
    );
    analysisOnlyIndices = imageResult.images
      .filter((img) => img.uploadState !== "approved_for_upload")
      .map((img) => img.order);
    console.log(
      "🤖 --non-interactive: facts taken from flags; final approvals still prompt\n",
    );
    facts = await applyLlmCopy(facts, config, options);
    showPreview(facts, imageResult.images, facts);
  } else {
    const interviewed = await interviewListing(imageResult.images, config, options);
    if (interviewed.cancelled) {
      console.log("🚫 Listing cancelled by user");
      return { runId: "", listingId: "", results: [], dryRun: true };
    }
    facts = interviewed.facts;
    analysisOnlyIndices = interviewed.analysisOnlyIndices;
  }

  let platforms: PlatformName[];
  if (options.platforms && options.platforms.length > 0) {
    platforms = options.platforms;
    console.log(`📡 Platforms: ${platforms.join(", ")}`);
  } else {
    platforms = await selectPlatforms(config);
  }
  if (platforms.length === 0) {
    console.log("🚫 No platforms selected");
    return { runId: "", listingId: "", results: [], dryRun: true };
  }

  let waTo = options.waTo ?? config.whatsappGroups;
  let yad2Type = options.yad2Type;
  const yad2Brand = options.yad2Brand;
  let groups = options.groups;

  if (!nonInteractive && platforms.includes("whatsapp") && !waTo?.length) {
    const raw = await input({
      message: "WhatsApp chats/groups (exact names, comma-separated):",
      default: "",
    });
    waTo = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!nonInteractive && platforms.includes("yad2") && !yad2Type) {
    yad2Type = (
      await input({
        message: "Yad2 product type (optional, e.g. מחשב נייד):",
        default: facts.category ?? "",
      })
    ).trim();
  }
  if (!nonInteractive && platforms.includes("facebook") && !groups?.length) {
    const raw = await input({
      message: "Facebook groups (optional, exact names, comma-separated):",
      default: "",
    });
    groups = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const diffs = describePlatformDifferences(
    {
      title: facts.title ?? "",
      category: facts.category,
      waTo,
      yad2Type,
      yad2Brand,
    },
    platforms,
  );
  if (diffs.length > 0) {
    console.log("\nPlatform-specific differences (master listing is reused):");
    for (const line of diffs) console.log(`  ${line}`);
    console.log("");
  }

  const isDryRun = options.noDryRun ? false : !publish || config.dryRun;
  if (isDryRun) {
    console.log(
      "\n🏖️  DRY-RUN MODE — drafts will be prepared, nothing will be published",
    );
    console.log(
      publish
        ? "(config dryRun=true overrides --publish; use --no-dry-run to force)"
        : "(use --publish to enable the approval path for real submissions)",
    );
  } else {
    console.log("\n⚡ PUBLISH MODE — submissions will be attempted");
    const reallyPublish = await confirm({
      message: "⚠️  You are about to publish to real platforms. Are you sure?",
      default: false,
    });
    if (!reallyPublish) {
      console.log("🚫 Publish cancelled by user");
      return { runId: "", listingId: "", results: [], dryRun: true };
    }
  }

  const store = new RunStore(resolve(".shark/runs"));
  const session = new BrowserSession({
    profilePath: resolve(
      config.browserProfilePath.replace("~", process.env["HOME"] ?? "~"),
    ),
    headed: true,
    cdpUrl: options.cdpUrl ?? "",
  });

  const flowOptions: SellFlowOptions = {
    images: imagePaths,
    publish,
    noDryRun: options.noDryRun,
    draftOnly: options.draftOnly,
    title: facts.title,
    price: facts.price,
    description: facts.description,
    condition: facts.condition,
    location: facts.location,
    category: facts.category,
    groups,
    platforms,
    analysisOnlyIndices,
    yad2Type,
    yad2Brand,
    waTo,
    defects: facts.defects,
    pickupDelivery: facts.pickupDelivery,
  };

  try {
    return await runSellFlow(flowOptions, {
      store,
      config,
      session: wrapSession(session),
      adapters: {
        facebook: new FacebookMarketplaceAdapter(),
        whatsapp: new WhatsAppWebAdapter(),
        yad2: new Yad2Adapter(),
      },
      notify: createHumanNotifier(),
      prompts: {
        // Final approvals are ALWAYS interactive — --non-interactive never touches confirm.
        confirm: (message, defaultValue) => confirm({ message, default: defaultValue }),
        // Free-text waits (e.g. "sign in, then press Enter") cannot be answered without a
        // human; in non-interactive mode they return immediately so the run fails closed
        // (awaiting_login) instead of hanging.
        input: (message) => (nonInteractive ? Promise.resolve("") : input({ message })),
        select: (message, choices) => select({ message, choices }),
        checkbox: (message, choices) => checkbox({ message, choices }),
      },
    });
  } finally {
    if (session.isAttached()) await session.detach();
    else await session.close().catch(() => {});
  }
}

export function resolveSellImagePaths(
  sources: string[] | undefined,
  images: string[] | undefined,
): string[] {
  const combined = [...(sources ?? []), ...(images ?? [])];
  if (combined.length === 0) {
    throw new Error("Provide an image folder or --image paths");
  }
  const collected = collectImageSources(combined);
  if (!collected.ok) {
    throw new Error(collected.errors.join("; "));
  }
  return collected.paths;
}
