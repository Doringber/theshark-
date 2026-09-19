import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowStatus } from "../domain/workflow.js";
import { redact } from "./redaction.js";

/** All possible run statuses — workflow states plus legacy aliases. */
export type RunStatus =
  WorkflowStatus | "drafted" | "awaiting_approval" | "published" | "cancelled";

/** Allowed status transitions — terminal states have no outgoing transitions */
export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  drafted: [
    "preparing",
    "awaiting_login",
    "awaiting_human_captcha",
    "filling_form",
    "awaiting_approval",
    "skipped",
    "failed",
    "cancelled",
  ],
  preparing: [
    "awaiting_login",
    "awaiting_human_captcha",
    "filling_form",
    "draft_ready",
    "skipped",
    "failed",
    "cancelled",
  ],
  awaiting_login: [
    "awaiting_approval",
    "awaiting_human_captcha",
    "filling_form",
    "skipped",
    "failed",
    "cancelled",
  ],
  awaiting_human_captcha: [
    "filling_form",
    "awaiting_login",
    "draft_ready",
    "skipped",
    "failed",
    "cancelled",
  ],
  filling_form: [
    "awaiting_human_captcha",
    "draft_ready",
    "awaiting_login",
    "skipped",
    "failed",
    "cancelled",
  ],
  draft_ready: [
    "awaiting_final_approval",
    "awaiting_approval",
    "skipped",
    "failed",
    "cancelled",
  ],
  awaiting_approval: [
    "published",
    "submitted",
    "skipped",
    "failed",
    "cancelled",
    "unknown_submission_state",
  ],
  awaiting_final_approval: [
    "submitted",
    "published",
    "skipped",
    "failed",
    "cancelled",
    "unknown_submission_state",
  ],
  published: [],
  submitted: [],
  skipped: [],
  failed: [],
  cancelled: [],
  unknown_submission_state: [],
};

/** Per-destination status within a run */
export interface DestinationRecord {
  platform: string;
  destination: string;
  status: RunStatus;
  updatedAt: string;
  reasonCode?: string;
  safeMessage?: string;
  nextStep?: string;
  completedSteps?: string[];
  completedActions?: string[];
  idempotencyKey?: string;
  contentVersion?: string;
}

/** Approved listing fields that are safe to persist locally. */
export interface SafeListingSnapshot {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: "NIS";
  condition: string;
  location: string;
  category?: string;
  groups?: string[];
  defects?: string;
  pickupDelivery?: string;
  language: "he" | "en" | "both";
  imagePaths: string[];
  imageOrder: number[];
  facts: Array<{ field: string; value: string; confidence: string }>;
  yad2Type?: string;
  yad2Brand?: string;
  waTo?: string[];
}

const FORBIDDEN_SNAPSHOT_KEYS = [
  "cookie",
  "cookies",
  "token",
  "password",
  "secret",
  "captcha",
  "hcaptcha",
  "localstorage",
  "sessionstorage",
  "header",
  "authorization",
];

const SAFE_SNAPSHOT_KEYS = new Set([
  "id",
  "title",
  "description",
  "price",
  "currency",
  "condition",
  "location",
  "category",
  "groups",
  "defects",
  "pickupDelivery",
  "language",
  "imagePaths",
  "imageOrder",
  "facts",
  "yad2Type",
  "yad2Brand",
  "waTo",
]);

/** A single run record — stored as a JSON file */
export interface RunRecord {
  id: string;
  listingId: string;
  platforms: string[];
  status: RunStatus;
  destinations: DestinationRecord[];
  listing?: SafeListingSnapshot;
  contentVersion?: string;
  answers?: Record<string, string>;
  publishMode?: boolean;
  draftOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class RunStore {
  readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async createRun(params: {
    listingId: string;
    platforms: string[];
  }): Promise<RunRecord> {
    await mkdir(this.storePath, { recursive: true });
    const now = new Date().toISOString();
    const record: RunRecord = {
      id: randomUUID(),
      listingId: params.listingId,
      platforms: params.platforms,
      status: "drafted",
      destinations: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.save(record);
    return record;
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    try {
      const filePath = join(this.storePath, `${id}.json`);
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as RunRecord;
    } catch {
      return undefined;
    }
  }

  async updateStatus(id: string, newStatus: RunStatus): Promise<RunRecord> {
    const record = await this.getRun(id);
    if (!record) {
      throw new Error(`Run "${id}" not found`);
    }

    const allowed = RUN_STATUS_TRANSITIONS[record.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: "${record.status}" → "${newStatus}" for run "${id}"`,
      );
    }

    record.status = newStatus;
    record.updatedAt = new Date().toISOString();
    await this.save(record);
    return record;
  }

  async updateDestinationStatus(
    runId: string,
    platform: string,
    destination: string,
    status: RunStatus,
  ): Promise<RunRecord> {
    const record = await this.getRun(runId);
    if (!record) {
      throw new Error(`Run "${runId}" not found`);
    }

    const existing = record.destinations.find(
      (d) => d.platform === platform && d.destination === destination,
    );
    const now = new Date().toISOString();

    if (existing) {
      existing.status = status;
      existing.updatedAt = now;
    } else {
      record.destinations.push({
        platform,
        destination,
        status,
        updatedAt: now,
      });
    }

    record.updatedAt = now;
    await this.save(record);
    return record;
  }

  async saveSafeListing(
    id: string,
    listing: SafeListingSnapshot,
    contentVersion: string,
  ): Promise<RunRecord> {
    const record = await this.getRun(id);
    if (!record) {
      throw new Error(`Run "${id}" not found`);
    }
    const keys = Object.keys(listing as unknown as Record<string, unknown>);
    const forbidden = keys.filter((key) =>
      FORBIDDEN_SNAPSHOT_KEYS.includes(key.toLowerCase()),
    );
    if (forbidden.length > 0) {
      throw new Error(
        `Unsafe listing snapshot fields are forbidden: ${forbidden.join(", ")}`,
      );
    }
    const unknown = keys.filter((key) => !SAFE_SNAPSHOT_KEYS.has(key));
    if (unknown.length > 0) {
      throw new Error(
        `Unsafe listing snapshot fields are forbidden: ${unknown.join(", ")}`,
      );
    }
    record.listing = listing;
    record.contentVersion = contentVersion;
    record.updatedAt = new Date().toISOString();
    await this.save(record);
    return record;
  }

  async saveDestinationCheckpoint(
    runId: string,
    checkpoint: Omit<DestinationRecord, "updatedAt"> & { updatedAt?: string },
  ): Promise<RunRecord> {
    const record = await this.getRun(runId);
    if (!record) {
      throw new Error(`Run "${runId}" not found`);
    }
    const now = new Date().toISOString();
    const next: DestinationRecord = {
      ...checkpoint,
      reasonCode: sanitizeReasonCode(checkpoint.reasonCode),
      safeMessage: sanitizeMessage(checkpoint.safeMessage),
      updatedAt: now,
    };
    const existing = record.destinations.find(
      (d) =>
        d.platform === checkpoint.platform && d.destination === checkpoint.destination,
    );
    if (existing) {
      Object.assign(existing, next);
    } else {
      record.destinations.push(next);
    }
    record.updatedAt = now;
    if (
      checkpoint.status === "awaiting_human_captcha" ||
      checkpoint.status === "awaiting_login" ||
      checkpoint.status === "unknown_submission_state"
    ) {
      record.status = checkpoint.status;
    }
    await this.save(record);
    return record;
  }

  private async save(record: RunRecord): Promise<void> {
    const filePath = join(this.storePath, `${record.id}.json`);
    await writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  }
}

function sanitizeReasonCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 80);
  return safe || undefined;
}

function sanitizeMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return redact(value).replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
}
