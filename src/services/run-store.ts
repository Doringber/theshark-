import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** All possible run statuses */
export type RunStatus =
  | "drafted"
  | "awaiting_login"
  | "awaiting_approval"
  | "published"
  | "skipped"
  | "failed"
  | "cancelled"
  | "unknown_submission_state";

/** Allowed status transitions — terminal states have no outgoing transitions */
export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  drafted: ["awaiting_login", "awaiting_approval", "skipped", "failed", "cancelled"],
  awaiting_login: ["awaiting_approval", "skipped", "failed", "cancelled"],
  awaiting_approval: [
    "published",
    "skipped",
    "failed",
    "cancelled",
    "unknown_submission_state",
  ],
  published: [],
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
}

/** A single run record — stored as a JSON file */
export interface RunRecord {
  id: string;
  listingId: string;
  platforms: string[];
  status: RunStatus;
  destinations: DestinationRecord[];
  createdAt: string;
  updatedAt: string;
}

export class RunStore {
  private readonly storePath: string;

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

  private async save(record: RunRecord): Promise<void> {
    const filePath = join(this.storePath, `${record.id}.json`);
    await writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  }
}
