import { createHash } from "node:crypto";
import { isRetryForbidden, type WorkflowStatus } from "../domain/workflow.js";
import type { DestinationRecord } from "./run-store.js";

export type PlatformAction =
  "create_draft" | "upload_images" | "send_message" | "publish";

export interface IdempotencyKeyParts {
  runId: string;
  listingId: string;
  platform: string;
  destination: string;
  contentVersion: string;
}

export interface ContentVersionFields {
  title: string;
  description: string;
  price: number;
  condition: string;
  location: string;
  imagePaths: string[];
}

export function buildIdempotencyKey(parts: IdempotencyKeyParts): string {
  return [
    parts.runId,
    parts.listingId,
    parts.platform,
    parts.destination,
    parts.contentVersion,
  ].join(":");
}

export function buildContentVersion(fields: ContentVersionFields): string {
  const payload = JSON.stringify({
    title: fields.title,
    description: fields.description,
    price: fields.price,
    condition: fields.condition,
    location: fields.location,
    imagePaths: fields.imagePaths,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function shouldSkipAction(
  record: DestinationRecord,
  action: PlatformAction,
  expectedKey: string,
): boolean {
  if (isRetryForbidden(record.status as WorkflowStatus)) {
    return true;
  }
  if (record.idempotencyKey !== expectedKey) {
    return false;
  }
  return (record.completedActions ?? []).includes(action);
}

export function recordAction(
  record: DestinationRecord,
  action: PlatformAction,
): DestinationRecord {
  const existing = record.completedActions ?? [];
  if (existing.includes(action)) {
    return record;
  }
  return {
    ...record,
    completedActions: [...existing, action],
  };
}
