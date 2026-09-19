import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { confirm, input, select, checkbox } from "@inquirer/prompts";

import {
  type ProductImage,
  type ApprovedListing,
  validateImagePath,
  getUploadableImages,
} from "../domain/schemas.js";
import { loadConfig, type SharkConfig, type PlatformName } from "../domain/config.js";
import { createApproval } from "../services/approvals.js";
import { RunStore, type RunRecord } from "../services/run-store.js";
import { BrowserSession } from "../browser/session.js";
import { FacebookMarketplaceAdapter } from "../platforms/facebook-marketplace.js";
import { WhatsAppWebAdapter } from "../platforms/whatsapp-web.js";
import { Yad2Adapter } from "../platforms/yad2.js";
import type {
  PlatformAdapter,
  SubmissionResult,
} from "../platforms/platform-adapter.js";

/** Maximum image file size in bytes (20 MB) */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

export interface SellOptions {
  images: string[];
  publish: boolean;
}

export interface SellResult {
  runId: string;
  listingId: string;
  results: SubmissionResult[];
  dryRun: boolean;
}

/** Resolve platform adapter by name */
function getAdapter(platform: PlatformName): PlatformAdapter {
  switch (platform) {
    case "facebook":
      return new FacebookMarketplaceAdapter();
    case "whatsapp":
      return new WhatsAppWebAdapter();
    case "yad2":
      return new Yad2Adapter();
  }
}

/**
 * Validate and prepare product images from file paths.
 * Checks: existence, size, format, deduplication.
 */
export function validateImages(
  imagePaths: string[],
): { valid: true; images: ProductImage[] } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const images: ProductImage[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < imagePaths.length; i++) {
    const rawPath = imagePaths[i] ?? "";
    const absPath = resolve(rawPath);

    // Deduplicate
    if (seen.has(absPath)) {
      errors.push(`Duplicate image: "${rawPath}"`);
      continue;
    }
    seen.add(absPath);

    // Existence
    if (!existsSync(absPath)) {
      errors.push(`Image not found: "${rawPath}"`);
      continue;
    }

    // Size
    const stats = statSync(absPath);
    if (stats.size === 0) {
      errors.push(`Image is empty (0 bytes): "${rawPath}"`);
      continue;
    }
    if (stats.size > MAX_IMAGE_SIZE) {
      errors.push(
        `Image too large (${(stats.size / 1024 / 1024).toFixed(1)} MB, max 20 MB): "${rawPath}"`,
      );
      continue;
    }

    // Format
    const pathResult = validateImagePath(absPath);
    if (!pathResult.valid) {
      errors.push(pathResult.reason);
      continue;
    }

    images.push({
      path: absPath,
      mediaType: pathResult.mediaType,
      order: i,
      uploadState: "approved_for_upload",
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  if (images.length === 0) {
    return { valid: false, errors: ["No valid images provided"] };
  }
  return { valid: true, images };
}

/**
 * Load config from shark.config.json or use defaults.
 */
async function resolveConfig(): Promise<SharkConfig> {
  const configPath = resolve("shark.config.json");
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(await readFile(configPath, "utf-8"));
      const result = loadConfig(raw, { allowLocalhost: false });
      if (result.valid) return result.config;
      console.warn(
        "⚠️  Config validation errors, using defaults:",
        result.errors.join(", "),
      );
    } catch {
      console.warn("⚠️  Could not parse shark.config.json, using defaults");
    }
  }
  const defaults = loadConfig({});
  if (!defaults.valid)
    throw new Error("Default config is invalid — this should never happen");
  return defaults.config;
}

/**
 * Interactive listing builder — prompts user for title, price, description, etc.
 */
async function buildListing(
  images: ProductImage[],
  config: SharkConfig,
): Promise<ApprovedListing> {
  console.log("\n🦈 Let's build your listing!\n");
  console.log(`📸 ${images.length} image(s) loaded\n`);

  const title = await input({
    message: "Product title:",
    validate: (v) => (v.trim().length > 0 ? true : "Title is required"),
  });

  const priceStr = await input({
    message: "Price (₪):",
    validate: (v) => {
      const n = Number(v);
      return !isNaN(n) && n > 0 ? true : "Enter a positive number";
    },
  });

  const description = await input({
    message: "Description:",
    validate: (v) => (v.trim().length > 0 ? true : "Description is required"),
  });

  const condition = await select({
    message: "Condition:",
    choices: [
      { name: "New", value: "new" as const },
      { name: "Like new", value: "like_new" as const },
      { name: "Good", value: "good" as const },
      { name: "Fair", value: "fair" as const },
      { name: "Poor", value: "poor" as const },
    ],
  });

  const location = await input({
    message: "Location/City:",
    default: "תל אביב",
    validate: (v) => (v.trim().length > 0 ? true : "Location is required"),
  });

  return {
    id: randomUUID(),
    title: title.trim(),
    description: description.trim(),
    price: Number(priceStr),
    currency: "NIS",
    condition,
    location: location.trim(),
    language: config.language,
    images,
    facts: [],
  } as ApprovedListing;
}

/**
 * Show a formatted listing preview in the terminal.
 */
function showPreview(listing: ApprovedListing): void {
  const uploadable = getUploadableImages(listing.images);
  console.log("\n" + "═".repeat(50));
  console.log("📋 LISTING PREVIEW");
  console.log("═".repeat(50));
  console.log(`  Title:       ${listing.title}`);
  console.log(`  Price:       ₪${listing.price}`);
  console.log(`  Condition:   ${listing.condition}`);
  console.log(`  Location:    ${listing.location}`);
  console.log(`  Description: ${listing.description}`);
  console.log(`  Images:      ${uploadable.length} approved for upload`);
  for (const img of uploadable) {
    console.log(`               [${img.order}] ${img.path}`);
  }
  console.log("═".repeat(50) + "\n");
}

/**
 * Select which enabled platforms to post to.
 */
async function selectPlatforms(config: SharkConfig): Promise<PlatformName[]> {
  const available: { name: string; value: PlatformName }[] = [];

  if (config.platforms.facebook.enabled)
    available.push({ name: "Facebook Marketplace", value: "facebook" });
  if (config.platforms.whatsapp.enabled)
    available.push({ name: "WhatsApp Groups", value: "whatsapp" });
  if (config.platforms.yad2.enabled) available.push({ name: "Yad2", value: "yad2" });

  if (available.length === 0) {
    console.log("❌ No platforms enabled in config");
    return [];
  }

  const selected = await checkbox({
    message: "Select platforms to post to:",
    choices: available.map((a) => ({ ...a, checked: true })),
  });

  return selected;
}

/**
 * Main sell orchestration flow.
 */
export async function runSell(options: SellOptions): Promise<SellResult> {
  const { images: imagePaths, publish } = options;

  // 1. Validate images
  console.log("🔍 Validating images...");
  const imageResult = validateImages(imagePaths);
  if (!imageResult.valid) {
    console.error("❌ Image validation failed:");
    for (const err of imageResult.errors) {
      console.error(`   • ${err}`);
    }
    throw new Error("Image validation failed");
  }
  console.log(`✅ ${imageResult.images.length} image(s) validated\n`);

  // 2. Load config
  const config = await resolveConfig();

  // 3. Build listing interactively
  const listing = await buildListing(imageResult.images, config);

  // 4. Show preview
  showPreview(listing);

  // 5. Confirm listing
  const listingOk = await confirm({
    message: "Does this listing look correct?",
    default: true,
  });
  if (!listingOk) {
    console.log("🚫 Listing cancelled by user");
    return {
      runId: "",
      listingId: listing.id,
      results: [],
      dryRun: true,
    };
  }

  // 6. Select platforms
  const platforms = await selectPlatforms(config);
  if (platforms.length === 0) {
    console.log("🚫 No platforms selected");
    return {
      runId: "",
      listingId: listing.id,
      results: [],
      dryRun: true,
    };
  }

  // 7. Create run record
  const store = new RunStore(resolve(".shark/runs"));
  const run = await store.createRun({
    listingId: listing.id,
    platforms,
  });
  console.log(`\n📝 Run created: ${run.id}`);

  // 8. Dry-run vs publish
  const isDryRun = !publish || config.dryRun;
  if (isDryRun) {
    console.log("\n🏖️  DRY-RUN MODE — no submissions will be made");
    console.log(
      publish
        ? "(config dryRun=true overrides --publish)"
        : "(use --publish to enable real submissions)",
    );
  } else {
    console.log("\n⚡ PUBLISH MODE — submissions will be attempted");
    const reallyPublish = await confirm({
      message: "⚠️  You are about to publish to real platforms. Are you sure?",
      default: false,
    });
    if (!reallyPublish) {
      console.log("🚫 Publish cancelled by user");
      await store.updateStatus(run.id, "cancelled");
      return {
        runId: run.id,
        listingId: listing.id,
        results: [],
        dryRun: true,
      };
    }
  }

  // 9. Execute per-platform
  const results: SubmissionResult[] = [];
  await store.updateStatus(run.id, "awaiting_approval");

  for (const platform of platforms) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`🌐 ${platform.toUpperCase()}`);
    console.log("─".repeat(40));

    const adapter = getAdapter(platform);

    if (isDryRun) {
      console.log(`  📋 Would prepare draft on ${platform}`);
      console.log(`  📋 Would fill: "${listing.title}" at ₪${listing.price}`);
      console.log(
        `  📋 Would upload ${getUploadableImages(listing.images).length} image(s)`,
      );
      console.log(`  ✅ Dry-run complete for ${platform}`);

      const dryResult: SubmissionResult = {
        status: "dry_run",
        destination: platform,
        message: "Dry-run — no submission made",
      };
      results.push(dryResult);
      await store.updateDestinationStatus(run.id, platform, platform, "skipped");
      continue;
    }

    // Real publish flow — launch browser
    let session: BrowserSession | null = null;
    try {
      console.log(`  🌐 Launching browser for ${platform}...`);
      session = new BrowserSession({
        profilePath: resolve(config.browserProfilePath, platform),
        headed: true,
      });
      const page = await session.getPage();

      // Navigate to platform
      const platformConfig = config.platforms[platform];
      await page.goto(platformConfig.url, { waitUntil: "domcontentloaded" });

      // Check login
      const loginState = await adapter.verifyLogin(page);
      if (loginState === "login_required") {
        console.log(`  🔐 Login required on ${platform}. Please log in manually.`);
        console.log("     Press Enter when you're logged in...");
        await input({ message: "Press Enter to continue..." });

        const retryState = await adapter.verifyLogin(page);
        if (retryState !== "logged_in") {
          console.log(`  ❌ Still not logged in on ${platform}. Skipping.`);
          results.push({
            status: "failed",
            destination: platform,
            message: "Login required but not completed",
          });
          await store.updateDestinationStatus(run.id, platform, platform, "failed");
          continue;
        }
      } else if (loginState === "unknown") {
        console.log(`  ⚠️  Cannot determine login state on ${platform}`);
        const proceed = await confirm({
          message: "Continue anyway?",
          default: false,
        });
        if (!proceed) {
          results.push({
            status: "skipped",
            destination: platform,
            message: "Skipped — unknown login state",
          });
          await store.updateDestinationStatus(run.id, platform, platform, "skipped");
          continue;
        }
      }

      // Prepare draft
      console.log(`  📝 Preparing draft on ${platform}...`);
      const draftResult = await adapter.prepareDraft(page, listing);
      if (!draftResult.success) {
        console.log(`  ❌ Draft failed: ${draftResult.error}`);
        results.push({
          status: draftResult.needsMapping ? "needs_mapping" : "failed",
          destination: platform,
          message: draftResult.error,
        });
        await store.updateDestinationStatus(run.id, platform, platform, "failed");
        continue;
      }

      // Preview
      const preview = await adapter.preview(page);
      console.log(`  📋 Preview: "${preview.title}" at ₪${preview.price}`);

      // Per-destination approval
      const destination = preview.destinations[0] ?? platform;
      const approveSubmit = await confirm({
        message: `Submit to ${platform} → ${destination}?`,
        default: false,
      });

      if (!approveSubmit) {
        console.log(`  🚫 Submission to ${destination} declined`);
        results.push({
          status: "skipped",
          destination,
          message: "User declined submission",
        });
        await store.updateDestinationStatus(run.id, platform, destination, "skipped");
        continue;
      }

      // Create fresh approval
      const approval = createApproval({
        runId: run.id,
        listingId: listing.id,
        platform,
        destination,
      });

      // Submit
      console.log(`  🚀 Submitting to ${destination}...`);
      const submitResult = await adapter.submit(page, approval);
      results.push(submitResult);

      const runStatus =
        submitResult.status === "published"
          ? "published"
          : submitResult.status === "unknown_submission_state"
            ? "unknown_submission_state"
            : "failed";
      await store.updateDestinationStatus(run.id, platform, destination, runStatus);
      console.log(
        `  ${submitResult.status === "published" ? "✅" : "⚠️"} ${submitResult.status}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error on ${platform}: ${msg}`);
      results.push({
        status: "failed",
        destination: platform,
        message: msg,
      });
      await store.updateDestinationStatus(run.id, platform, platform, "failed");
    } finally {
      if (session) {
        await session.close().catch(() => {});
      }
    }
  }

  // 10. Summary
  printSummary(run, results, isDryRun);

  return {
    runId: run.id,
    listingId: listing.id,
    results,
    dryRun: isDryRun,
  };
}

function printSummary(
  run: RunRecord,
  results: SubmissionResult[],
  isDryRun: boolean,
): void {
  console.log("\n" + "═".repeat(50));
  console.log("📊 SUMMARY");
  console.log("═".repeat(50));
  console.log(`  Run ID:    ${run.id}`);
  console.log(`  Mode:      ${isDryRun ? "🏖️ Dry-run" : "⚡ Publish"}`);
  console.log(`  Platforms: ${run.platforms.join(", ")}`);
  console.log("");
  for (const r of results) {
    const icon =
      r.status === "published"
        ? "✅"
        : r.status === "dry_run"
          ? "🏖️"
          : r.status === "skipped"
            ? "⏭️"
            : "❌";
    console.log(
      `  ${icon} ${r.destination}: ${r.status}${r.message ? ` — ${r.message}` : ""}`,
    );
  }
  console.log("═".repeat(50) + "\n");
}
