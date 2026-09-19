import type { Page } from "playwright";
import {
  BasePlatformAdapter,
  type DraftResult,
  type PlatformPreview,
  type SubmissionResult,
} from "./platform-adapter.js";
import type { ApprovedListing } from "../domain/schemas.js";
import type { ApprovalToken } from "../services/approvals.js";
import { validateApproval } from "../services/approvals.js";
import { getUploadableImages, validateUploadManifest } from "../domain/schemas.js";

export class Yad2Adapter extends BasePlatformAdapter {
  readonly name = "yad2" as const;

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    const publish = page.locator('[aria-label="Publish"]').first();
    if (await publish.isVisible().catch(() => false)) return "logged_in";

    const login = page.locator('[aria-label="התחברות"]').first();
    if (await login.isVisible().catch(() => false)) return "login_required";

    return "unknown";
  }

  async prepareDraft(page: Page, listing: ApprovedListing): Promise<DraftResult> {
    try {
      const uploadable = getUploadableImages(listing.images);
      if (uploadable.length === 0) {
        return {
          success: false,
          error: "No approved images available for upload",
        };
      }
      const manifestCheck = validateUploadManifest(uploadable);
      if (!manifestCheck.valid) {
        return { success: false, error: manifestCheck.reason };
      }

      // Navigate: מוצרים → פרטי
      const productsLink = page.getByLabel("מוצרים");
      if (!(await productsLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Products (מוצרים) link not found — needs_mapping",
        };
      }
      await productsLink.click();
      await page.waitForLoadState("domcontentloaded");

      // Select Private (פרטי), never Business (מנוי עסקי)
      const privateLink = page.getByLabel("פרטי");
      if (!(await privateLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Private (פרטי) option not found — needs_mapping",
        };
      }

      // Verify we don't accidentally select Business
      const businessLink = page.getByLabel("מנוי עסקי");
      const businessVisible = await businessLink.isVisible().catch(() => false);
      if (businessVisible) {
        // Good — we can see both options, we'll click Private
      }

      await privateLink.click();
      await page.waitForLoadState("domcontentloaded");

      // Fill the product form
      const titleInput = page.getByLabel("כותרת");
      if (!(await titleInput.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Title (כותרת) field not found — needs_mapping",
        };
      }

      await titleInput.fill(listing.title);
      await page.getByLabel("מחיר").fill(String(listing.price));

      const descField = page.getByLabel("תיאור");
      if (await descField.isVisible().catch(() => false)) {
        await descField.fill(listing.description);
      }

      const cityField = page.getByLabel("עיר");
      if (await cityField.isVisible().catch(() => false)) {
        await cityField.fill(listing.location);
      }

      // Upload photos
      const photoInput = page.getByLabel("הוספת תמונות");
      if (await photoInput.isVisible().catch(() => false)) {
        const filePaths = uploadable.map((img) => img.path);
        await photoInput.setInputFiles(filePaths);
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  async preview(page: Page): Promise<PlatformPreview> {
    const title =
      (await page
        .getByLabel("כותרת")
        .inputValue()
        .catch(() => "")) || "";
    const price =
      (await page
        .getByLabel("מחיר")
        .inputValue()
        .catch(() => "")) || "";
    const description =
      (await page
        .getByLabel("תיאור")
        .inputValue()
        .catch(() => "")) || "";

    return {
      platform: "yad2",
      title,
      description,
      price,
      images: [],
      destinations: ["yad2"],
    };
  }

  async submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult> {
    const destination = "yad2";

    // Validate the approval
    const validationResult = validateApproval(approval, {
      runId: approval?.runId ?? "",
      listingId: approval?.listingId ?? "",
      platform: "yad2",
      destination,
    });

    if (!validationResult.valid) {
      return {
        status: "failed",
        destination,
        message: `Approval rejected: ${validationResult.reason}`,
      };
    }

    // Click Publish (פרסום)
    const publishBtn = page.getByLabel("פרסום");
    if (!(await publishBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination,
        message: "Publish (פרסום) button not found",
      };
    }

    await publishBtn.click();

    // Check result
    const status = await page.locator("#publish-status").textContent();
    if (status === "published") {
      return { status: "published", destination };
    }

    return {
      status: "unknown_submission_state",
      destination,
      message: "Publish may have triggered but result uncertain",
    };
  }
}
