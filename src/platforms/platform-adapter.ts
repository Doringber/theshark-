import type { Page } from "playwright";
import type { ApprovalToken } from "../services/approvals.js";
import type { ApprovedListing } from "../domain/schemas.js";

/** Result from preparing a draft on a platform */
export interface DraftResult {
  success: boolean;
  /** If the draft could not be prepared, explain why */
  error?: string;
  /** If a required step could not be located */
  needsMapping?: boolean;
}

/** Preview of what will be submitted */
export interface PlatformPreview {
  platform: string;
  title: string;
  description: string;
  price: string;
  images: string[];
  destinations: string[];
  /** Any additional platform-specific fields */
  extras?: Record<string, string>;
}

/** Result of a submission attempt */
export interface SubmissionResult {
  status:
    | "published"
    | "skipped"
    | "failed"
    | "unknown_submission_state"
    | "needs_mapping"
    | "dry_run";
  destination: string;
  message?: string;
}

export type PlatformAdapterName = "facebook" | "whatsapp" | "yad2";

/**
 * Platform adapter contract.
 * Each platform implements this interface to handle its specific UI flow.
 * Selectors are kept inside the adapter and use accessible roles/labels/text.
 */
export interface PlatformAdapter {
  readonly name: PlatformAdapterName;

  /** Verify if the user is logged in on this platform */
  verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown">;

  /** Prepare a draft listing on this platform */
  prepareDraft(page: Page, listing: ApprovedListing): Promise<DraftResult>;

  /** Get a preview of what will be submitted */
  preview(page: Page): Promise<PlatformPreview>;

  /**
   * Submit the listing.
   * MUST reject unless a fresh, valid approval token is provided.
   * The approval must match the exact platform, destination, run, and listing.
   */
  submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult>;
}

/**
 * Base adapter that stubs all methods as needs_mapping.
 * Real adapters extend this and override with actual implementations.
 */
export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly name: PlatformAdapterName;

  async verifyLogin(_page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    return "unknown";
  }

  async prepareDraft(_page: Page, _listing: ApprovedListing): Promise<DraftResult> {
    return {
      success: false,
      needsMapping: true,
      error: `${this.name} adapter not yet implemented — needs_mapping`,
    };
  }

  async preview(_page: Page): Promise<PlatformPreview> {
    return {
      platform: this.name,
      title: "",
      description: "",
      price: "",
      images: [],
      destinations: [],
    };
  }

  async submit(_page: Page, _approval: ApprovalToken): Promise<SubmissionResult> {
    return {
      status: "needs_mapping",
      destination: "",
      message: `${this.name} adapter not yet implemented`,
    };
  }
}
