import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import type { ApprovedListing, ProductImage } from "../domain/schemas.js";
import { getUploadableImages } from "../domain/schemas.js";
import type { PlatformName, SharkConfig } from "../domain/config.js";
import { isRetryForbidden, type WorkflowStatus } from "../domain/workflow.js";
import {
  RunStore,
  type DestinationRecord,
  type RunRecord,
  type SafeListingSnapshot,
} from "../services/run-store.js";
import {
  buildContentVersion,
  buildIdempotencyKey,
  shouldSkipAction,
} from "../services/idempotency.js";
import { acquireRunLock, RunLockedError } from "../services/run-lock.js";
import { captchaInstruction, type HumanNotifier } from "../services/human-notify.js";
import { formatRunStatus } from "../services/run-status-view.js";
import { validateImages } from "../services/image-sources.js";
import { createApproval } from "../services/approvals.js";
import type {
  DraftResult,
  PlatformAdapter,
  SubmissionResult,
} from "../platforms/platform-adapter.js";
import { FacebookMarketplaceAdapter } from "../platforms/facebook-marketplace.js";
import { WhatsAppWebAdapter } from "../platforms/whatsapp-web.js";
import { Yad2Adapter } from "../platforms/yad2.js";
import { waitForChallengeClear } from "../browser/challenge-detector.js";
import {
  findPlatformTab,
  identifyPlatformPage,
  pageUrlMatchesPlatform,
  platformReuseNeedles,
} from "../browser/page-identity.js";

const DEFAULT_CAPTCHA_TIMEOUT_MS = 10 * 60 * 1000;

export interface SellFlowOptions {
  images: string[];
  publish: boolean;
  noDryRun?: boolean;
  draftOnly?: boolean;
  title?: string;
  price?: number;
  description?: string;
  condition?: "new" | "like_new" | "good" | "fair" | "poor";
  location?: string;
  category?: string;
  groups?: string[];
  platforms?: PlatformName[];
  analysisOnlyIndices?: number[];
  yad2Type?: string;
  yad2Brand?: string;
  waTo?: string[];
  defects?: string;
  pickupDelivery?: string;
  captchaTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface SellFlowResult {
  runId: string;
  listingId: string;
  results: SubmissionResult[];
  dryRun: boolean;
}

export interface BrowserPort {
  getPage: (opts?: { reuseUrlIncludes?: string | string[] }) => Promise<Page>;
  focus: (page: Page) => Promise<void>;
  pages: () => Page[];
  detach: () => Promise<void>;
  close: () => Promise<void>;
  isAttached: () => boolean;
}

export interface PromptPort {
  confirm: (message: string, defaultValue?: boolean) => Promise<boolean>;
  input: (message: string) => Promise<string>;
  select: <T>(message: string, choices: { name: string; value: T }[]) => Promise<T>;
  checkbox: <T>(
    message: string,
    choices: { name: string; value: T; checked?: boolean }[],
  ) => Promise<T[]>;
}

export interface SellFlowDeps {
  store: RunStore;
  storePath?: string;
  config: SharkConfig;
  session: BrowserPort;
  adapters: Record<PlatformName, PlatformAdapter>;
  notify: HumanNotifier;
  prompts: PromptPort;
  detectChallenge?: (page: Page) => Promise<{ present: boolean; kind?: string }>;
  waitForChallenge?: (
    page: Page,
    options: { timeoutMs: number; intervalMs?: number },
  ) => Promise<"cleared" | "timeout">;
  identifyPage?: (
    page: Page,
    platform: PlatformName,
  ) => Promise<"form_ready" | "challenge" | "login" | "needs_mapping">;
  platformUrls?: Partial<Record<PlatformName, string>>;
}

export async function runSellFlow(
  options: SellFlowOptions,
  deps: SellFlowDeps,
): Promise<SellFlowResult> {
  const prepared = prepareListing(options, deps.config);
  const store = deps.store;
  const run = await store.createRun({
    listingId: prepared.listing.id,
    platforms: prepared.platforms,
  });
  await store.saveSafeListing(run.id, prepared.snapshot, prepared.contentVersion);
  return executeRun(run.id, options, deps);
}

export async function resumeSellFlow(
  runId: string,
  options: SellFlowOptions,
  deps: SellFlowDeps,
): Promise<SellFlowResult> {
  return executeRun(runId, options, deps);
}

async function executeRun(
  runId: string,
  options: SellFlowOptions,
  deps: SellFlowDeps,
): Promise<SellFlowResult> {
  const storePath = deps.storePath ?? deps.store.storePath;
  const lock = await acquireRunLock(storePath, runId);
  try {
    const run = await deps.store.getRun(runId);
    if (!run) throw new Error(`Run "${runId}" not found`);
    if (!run.listing) throw new Error(`Run "${runId}" has no saved listing to resume`);

    const listing = listingFromSnapshot(run.listing);
    const platforms = (run.platforms as PlatformName[]).filter(Boolean);
    const isDryRun = options.noDryRun ? false : !options.publish || deps.config.dryRun;
    const contentVersion =
      run.contentVersion ??
      buildContentVersion({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        condition: listing.condition,
        location: listing.location,
        imagePaths: getUploadableImages(listing.images).map((img) => img.path),
      });

    configureAdapters(deps.adapters, options, deps.config, listing, run);
    const results: SubmissionResult[] = [];

    for (const platform of platforms) {
      const destination = platformDestination(platform, options, listing);
      const existing = run.destinations.find((d) => d.platform === platform);
      const key = buildIdempotencyKey({
        runId,
        listingId: listing.id,
        platform,
        destination,
        contentVersion,
      });

      if (existing && shouldSkipPlatform(existing, key, isDryRun)) {
        results.push(toResult(existing));
        continue;
      }

      const adapter = deps.adapters[platform];
      const url = deps.platformUrls?.[platform] ?? deps.config.platforms[platform].url;
      const page = await acquirePlatformPage(deps, platform, url);

      const login = await adapter.verifyLogin(page);
      if (login === "login_required") {
        await deps.store.saveDestinationCheckpoint(runId, {
          platform,
          destination,
          status: "awaiting_login",
          reasonCode: "login_required",
          safeMessage: `${platform} requires a manual sign-in.`,
          idempotencyKey: key,
          contentVersion,
          completedSteps: existing?.completedSteps ?? [],
          completedActions: existing?.completedActions ?? [],
        });
        await deps.prompts.input("Sign in, then press Enter to continue...");
        const retry = await adapter.verifyLogin(page);
        if (retry !== "logged_in") {
          results.push({
            status: "awaiting_login",
            destination,
            message: "Login required",
          });
          continue;
        }
      }

      const completedSteps = existing?.completedSteps ?? [];
      let draft: DraftResult;
      if (
        existing &&
        (existing.status === "draft_ready" ||
          existing.status === "awaiting_final_approval" ||
          existing.status === "awaiting_approval") &&
        !isDryRun
      ) {
        draft = {
          success: true,
          completedSteps,
          completedActions: existing.completedActions,
        };
      } else {
        draft = await adapter.prepareDraft(page, listing, {
          completedSteps,
          resumeFrom: existing?.nextStep,
        });
        draft = await resolveChallenge({
          draft,
          page,
          platform,
          runId,
          destination,
          adapter,
          listing,
          options,
          deps,
          completedSteps,
        });
      }

      if (draft.challenge) {
        await persistChallenge(
          deps,
          runId,
          platform,
          destination,
          key,
          contentVersion,
          draft,
        );
        results.push({
          status: "awaiting_human_captcha",
          destination,
          message: captchaInstruction(platform),
        });
        continue;
      }

      if (draft.needsMapping) {
        await deps.store.saveDestinationCheckpoint(runId, {
          platform,
          destination,
          status: "failed",
          reasonCode: "needs_mapping",
          safeMessage: draft.error ?? `${platform} page needs mapping.`,
          nextStep: "inspect",
          completedSteps: draft.completedSteps ?? completedSteps,
          completedActions: draft.completedActions ?? existing?.completedActions ?? [],
          idempotencyKey: key,
          contentVersion,
        });
        results.push({
          status: "needs_mapping",
          destination,
          message: draft.error,
        });
        continue;
      }

      if (!draft.success) {
        await deps.store.saveDestinationCheckpoint(runId, {
          platform,
          destination,
          status: "failed",
          reasonCode: "draft_failed",
          safeMessage: draft.error ?? `${platform} draft preparation failed.`,
          completedSteps: draft.completedSteps ?? completedSteps,
          completedActions: existing?.completedActions ?? [],
          idempotencyKey: key,
          contentVersion,
        });
        results.push({ status: "failed", destination, message: draft.error });
        continue;
      }

      const actions = unique([
        ...(existing?.completedActions ?? []),
        ...(draft.completedActions ?? ["create_draft", "upload_images"]),
      ]);
      await deps.store.saveDestinationCheckpoint(runId, {
        platform,
        destination,
        status: "draft_ready",
        completedSteps: draft.completedSteps ?? completedSteps,
        completedActions: actions,
        idempotencyKey: key,
        contentVersion,
      });

      if (isDryRun || options.draftOnly) {
        results.push({
          status: "draft_ready",
          destination,
          message: "Draft prepared — no final action",
        });
        continue;
      }

      const approve = await deps.prompts.confirm(
        `Submit to ${platform} → ${destination}?`,
        false,
      );
      if (!approve) {
        results.push({
          status: "skipped",
          destination,
          message: "User declined submission",
        });
        continue;
      }

      const latest = await deps.store.getRun(runId);
      const latestDest = latest?.destinations.find((d) => d.platform === platform);
      if (latestDest && isRetryForbidden(latestDest.status as WorkflowStatus)) {
        results.push(toResult(latestDest));
        continue;
      }
      if (latestDest && shouldSkipAction(latestDest, "publish", key)) {
        results.push(toResult(latestDest));
        continue;
      }

      await deps.store.saveDestinationCheckpoint(runId, {
        platform,
        destination,
        status: "awaiting_final_approval",
        completedSteps: draft.completedSteps ?? completedSteps,
        completedActions: actions,
        idempotencyKey: key,
        contentVersion,
      });

      const approval = createApproval({
        runId,
        listingId: listing.id,
        platform,
        destination,
      });
      const submitted = await adapter.submit(page, approval);
      const destStatus =
        submitted.status === "published" || submitted.status === "submitted"
          ? "submitted"
          : submitted.status === "unknown_submission_state"
            ? "unknown_submission_state"
            : submitted.status === "skipped"
              ? "skipped"
              : "failed";
      await deps.store.saveDestinationCheckpoint(runId, {
        platform,
        destination,
        status: destStatus,
        reasonCode:
          destStatus === "unknown_submission_state"
            ? "submission_confirmation_missing"
            : destStatus === "failed"
              ? "submission_failed"
              : undefined,
        safeMessage:
          destStatus === "unknown_submission_state" || destStatus === "failed"
            ? submitted.message
            : undefined,
        completedActions: unique([
          ...actions,
          destStatus === "submitted" ? "publish" : "",
        ]).filter(Boolean),
        idempotencyKey: key,
        contentVersion,
      });
      results.push({
        ...submitted,
        status: submitted.status === "published" ? "submitted" : submitted.status,
        destination: submitted.destination || destination,
      });
    }

    const fresh = (await deps.store.getRun(runId)) ?? run;
    const pendingCaptcha = results.some((r) => r.status === "awaiting_human_captcha");
    console.log(formatRunStatus(fresh, { timedOut: pendingCaptcha }));
    return {
      runId,
      listingId: listing.id,
      results,
      dryRun: isDryRun,
    };
  } finally {
    await lock.release();
  }
}

async function resolveChallenge(params: {
  draft: DraftResult;
  page: Page;
  platform: PlatformName;
  runId: string;
  destination: string;
  adapter: PlatformAdapter;
  listing: ApprovedListing;
  options: SellFlowOptions;
  deps: SellFlowDeps;
  completedSteps: string[];
}): Promise<DraftResult> {
  const { page, platform, runId, adapter, listing, options, deps } = params;
  let draft = params.draft;
  if (!draft.challenge) return draft;

  await deps.session.focus(page);
  await deps.notify.notifyCaptcha({ runId, platform });
  const timeoutMs = options.captchaTimeoutMs ?? DEFAULT_CAPTCHA_TIMEOUT_MS;
  const wait = deps.waitForChallenge
    ? await deps.waitForChallenge(page, {
        timeoutMs,
        intervalMs: options.pollIntervalMs,
      })
    : await waitForChallengeClear(page, {
        timeoutMs,
        intervalMs: options.pollIntervalMs,
      });
  if (wait === "timeout") return draft;

  const identify = deps.identifyPage ?? identifyPlatformPage;
  const identity = await identify(page, platform);
  if (identity === "login") {
    return { success: false, error: "Login required after verification" };
  }
  if (identity === "needs_mapping") {
    return { success: false, needsMapping: true, error: "Unknown page after CAPTCHA" };
  }
  if (identity === "challenge") {
    return draft;
  }

  draft = await adapter.prepareDraft(page, listing, {
    resumeFrom: draft.nextStep,
    completedSteps: draft.completedSteps ?? params.completedSteps,
  });
  return draft;
}

async function acquirePlatformPage(
  deps: SellFlowDeps,
  platform: PlatformName,
  url: string | undefined,
): Promise<Page> {
  const existing = await findPlatformTab(deps.session.pages(), platform);
  if (existing) {
    await deps.session.focus(existing);
    return existing;
  }
  const page = await deps.session.getPage({
    reuseUrlIncludes: platformReuseNeedles(platform),
  });
  const currentUrl = typeof page.url === "function" ? page.url() : "";
  if (
    url &&
    !pageUrlMatchesPlatform(currentUrl, platform) &&
    typeof page.goto === "function"
  ) {
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  return page;
}

async function persistChallenge(
  deps: SellFlowDeps,
  runId: string,
  platform: PlatformName,
  destination: string,
  key: string,
  contentVersion: string,
  draft: DraftResult,
): Promise<void> {
  await deps.store.saveDestinationCheckpoint(runId, {
    platform,
    destination,
    status: "awaiting_human_captcha",
    nextStep: draft.nextStep,
    completedSteps: draft.completedSteps ?? [],
    completedActions: draft.completedActions ?? [],
    idempotencyKey: key,
    contentVersion,
  });
}

function shouldSkipPlatform(
  existing: DestinationRecord,
  key: string,
  isDryRun: boolean,
): boolean {
  if (isRetryForbidden(existing.status as WorkflowStatus)) return true;
  if (existing.status === "submitted" || existing.status === "published") return true;
  if (isDryRun && existing.status === "draft_ready") return true;
  if (shouldSkipAction(existing, "publish", key)) return true;
  return false;
}

function toResult(existing: DestinationRecord): SubmissionResult {
  const status =
    existing.status === "published"
      ? "submitted"
      : (existing.status as SubmissionResult["status"]);
  return { status, destination: existing.destination };
}

function platformDestination(
  platform: PlatformName,
  options: SellFlowOptions,
  listing: ApprovedListing,
): string {
  if (platform === "whatsapp") {
    const chats = options.waTo ?? listing.groups ?? [];
    return chats.length ? chats.join(",") : "whatsapp";
  }
  if (platform === "facebook" && options.groups?.length) {
    return ["marketplace", ...options.groups].join(",");
  }
  return platform;
}

function configureAdapters(
  adapters: Record<PlatformName, PlatformAdapter>,
  options: SellFlowOptions,
  config: SharkConfig,
  listing: ApprovedListing,
  run: RunRecord,
): void {
  const facebook = adapters.facebook;
  if (facebook instanceof FacebookMarketplaceAdapter && options.groups?.length) {
    facebook.targetGroups = options.groups;
  }
  const yad2 = adapters.yad2;
  if (yad2 instanceof Yad2Adapter) {
    if (options.yad2Type ?? listing.category) {
      yad2.productType = options.yad2Type ?? listing.category;
    }
    if (options.yad2Brand) yad2.brand = options.yad2Brand;
    yad2.address = config.seller;
  }
  const whatsapp = adapters.whatsapp;
  if (whatsapp instanceof WhatsAppWebAdapter) {
    whatsapp.targetChats = options.waTo ?? config.whatsappGroups ?? [];
    const sent = run.destinations
      .filter(
        (d) =>
          d.platform === "whatsapp" && d.completedActions?.includes("send_message"),
      )
      .map((d) => d.destination);
    whatsapp.alreadySentChats = sent;
  }
}

function prepareListing(
  options: SellFlowOptions,
  config: SharkConfig,
): {
  listing: ApprovedListing;
  snapshot: SafeListingSnapshot;
  contentVersion: string;
  platforms: PlatformName[];
} {
  const imageResult = validateImages(options.images);
  if (!imageResult.valid) {
    throw new Error(imageResult.errors.join("; "));
  }
  for (const idx of options.analysisOnlyIndices ?? []) {
    const img = imageResult.images[idx];
    if (img) img.uploadState = "analysis_only";
  }
  const uploadable = getUploadableImages(imageResult.images);
  if (uploadable.length === 0) {
    throw new Error("No images approved for upload");
  }
  const listing = {
    id: randomUUID(),
    title: options.title ?? "",
    description: options.description ?? "",
    price: options.price ?? 0,
    currency: "NIS" as const,
    condition: options.condition ?? "good",
    location: options.location ?? config.seller.city ?? "תל אביב",
    category: options.category,
    groups: options.groups,
    defects: options.defects,
    pickupDelivery: options.pickupDelivery ?? config.pickupPreference,
    language: config.language,
    images: imageResult.images,
    facts: [],
  } as ApprovedListing;
  const snapshot: SafeListingSnapshot = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: "NIS",
    condition: listing.condition,
    location: listing.location,
    category: listing.category,
    groups: listing.groups,
    defects: listing.defects,
    pickupDelivery: listing.pickupDelivery,
    language: listing.language,
    imagePaths: uploadable.map((img) => img.path),
    imageOrder: uploadable.map((img) => img.order),
    facts: [],
    yad2Type: options.yad2Type,
    yad2Brand: options.yad2Brand,
    waTo: options.waTo,
  };
  return {
    listing,
    snapshot,
    contentVersion: buildContentVersion({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      condition: listing.condition,
      location: listing.location,
      imagePaths: snapshot.imagePaths,
    }),
    platforms: options.platforms ??
      config.defaultPlatforms ?? ["facebook", "whatsapp", "yad2"],
  };
}

function listingFromSnapshot(snapshot: SafeListingSnapshot): ApprovedListing {
  const images: ProductImage[] = snapshot.imagePaths.map((path, index) => ({
    path,
    mediaType: path.toLowerCase().endsWith(".png")
      ? "image/png"
      : path.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : "image/jpeg",
    order: snapshot.imageOrder[index] ?? index,
    uploadState: "approved_for_upload",
  }));
  return {
    id: snapshot.id,
    title: snapshot.title,
    description: snapshot.description,
    price: snapshot.price,
    currency: "NIS",
    condition: snapshot.condition as ApprovedListing["condition"],
    location: snapshot.location,
    category: snapshot.category,
    groups: snapshot.groups ?? snapshot.waTo,
    defects: snapshot.defects,
    pickupDelivery: snapshot.pickupDelivery,
    language: snapshot.language,
    images,
    facts: [],
  } as ApprovedListing;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export { RunLockedError };
