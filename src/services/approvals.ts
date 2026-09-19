import { randomUUID } from "node:crypto";
import type { PlatformName } from "../domain/config.js";

/** Default approval lifetime in milliseconds (5 minutes) */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Internal symbol to prove the approval was created in-memory */
const APPROVAL_BRAND = Symbol("shark-approval");

export interface ApprovalParams {
  runId: string;
  listingId: string;
  platform: PlatformName | "facebook" | "whatsapp" | "yad2";
  destination: string;
}

export interface ApprovalToken {
  /** Unique token ID */
  readonly tokenId: string;
  /** Run this approval belongs to */
  readonly runId: string;
  /** Listing this approval belongs to */
  readonly listingId: string;
  /** Target platform */
  readonly platform: string;
  /** Exact destination (e.g. "marketplace", "group-tlv") */
  readonly destination: string;
  /** When the approval was created */
  readonly createdAt: Date;
  /** When the approval expires */
  readonly expiresAt: Date;
  /** Internal brand — proves in-memory origin, lost on serialization */
  readonly [APPROVAL_BRAND]: true;
}

/**
 * Create a fresh in-memory approval token.
 * Approvals are never persisted, reused, or shared between destinations.
 */
export function createApproval(params: ApprovalParams): ApprovalToken {
  const now = new Date();
  return {
    tokenId: randomUUID(),
    runId: params.runId,
    listingId: params.listingId,
    platform: params.platform,
    destination: params.destination,
    createdAt: now,
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    [APPROVAL_BRAND]: true,
  };
}

/**
 * Validate an approval token against the expected parameters.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * Rejects if:
 * - Token is null/undefined
 * - Token lost its in-memory brand (was serialized/deserialized)
 * - Token is expired
 * - Run ID, listing ID, platform, or destination doesn't match
 */
export function validateApproval(
  token: ApprovalToken,
  expected: ApprovalParams,
): { valid: true } | { valid: false; reason: string } {
  if (!token || typeof token !== "object") {
    return { valid: false, reason: "No approval token provided" };
  }

  // Check the in-memory brand — survives only in the original process memory
  if (!(APPROVAL_BRAND in token)) {
    return {
      valid: false,
      reason:
        "Approval token is not a fresh in-memory instance (possibly deserialized)",
    };
  }

  // Verify dates are actual Date objects (not strings from JSON)
  if (!(token.createdAt instanceof Date) || !(token.expiresAt instanceof Date)) {
    return {
      valid: false,
      reason: "Approval token dates are invalid (possibly deserialized)",
    };
  }

  // Check expiry
  if (new Date() > token.expiresAt) {
    return { valid: false, reason: "Approval token has expired" };
  }

  // Check run ID
  if (token.runId !== expected.runId) {
    return {
      valid: false,
      reason: `Approval run ID mismatch: expected "${expected.runId}", got "${token.runId}"`,
    };
  }

  // Check listing ID
  if (token.listingId !== expected.listingId) {
    return {
      valid: false,
      reason: `Approval listing ID mismatch: expected "${expected.listingId}", got "${token.listingId}"`,
    };
  }

  // Check platform
  if (token.platform !== expected.platform) {
    return {
      valid: false,
      reason: `Approval platform mismatch: expected "${expected.platform}", got "${token.platform}"`,
    };
  }

  // Check exact destination
  if (token.destination !== expected.destination) {
    return {
      valid: false,
      reason: `Approval destination mismatch: expected "${expected.destination}", got "${token.destination}"`,
    };
  }

  return { valid: true };
}
