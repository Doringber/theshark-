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

export class FacebookMarketplaceAdapter extends BasePlatformAdapter {
  readonly name = "facebook" as const;

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    const userMenu = page.locator('[aria-label="User menu"]').first();
    if (await userMenu.isVisible().catch(() => false)) return "logged_in";

    const home = page.locator('[aria-label="Home"]').first();
    if (await home.isVisible().catch(() => false)) return "logged_in";

    const loginForm = page.locator('[aria-label="Login form"]').first();
    if (await loginForm.isVisible().catch(() => false)) return "login_required";

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible().catch(() => false)) return "login_required";

    return "unknown";
  }

  async prepareDraft(page: Page, listing: ApprovedListing): Promise<DraftResult> {
    try {
      // Validate upload manifest — only approved images, at least one
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

      // Navigate: Marketplace → Create new listing → Item for sale
      const marketplaceLink = page.getByLabel("Marketplace");
      if (!(await marketplaceLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Marketplace link not found — needs_mapping",
        };
      }
      await marketplaceLink.click();
      await page.waitForLoadState("domcontentloaded");

      const createLink = page.getByLabel("Create new listing");
      if (!(await createLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Create new listing link not found — needs_mapping",
        };
      }
      await createLink.click();
      await page.waitForLoadState("domcontentloaded");

      const itemForSale = page.getByLabel("Item for sale");
      if (!(await itemForSale.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Item for sale option not found — needs_mapping",
        };
      }
      await itemForSale.click();
      await page.waitForLoadState("domcontentloaded");

      // Fill the item form
      const titleInput = page.getByLabel("Title");
      if (!(await titleInput.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Title field not found — needs_mapping",
        };
      }

      await titleInput.fill(listing.title);
      await page.getByLabel("Price").fill(String(listing.price));
      await page.getByLabel("Description").fill(listing.description);

      const locationField = page.getByLabel("Location");
      if (await locationField.isVisible().catch(() => false)) {
        await locationField.fill(listing.location);
      }

      // Upload photos (set file input)
      const photoInput = page.getByLabel("Add photos");
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
        .getByLabel("Title")
        .inputValue()
        .catch(() => "")) || "";
    const price =
      (await page
        .getByLabel("Price")
        .inputValue()
        .catch(() => "")) || "";
    const description =
      (await page
        .getByLabel("Description")
        .inputValue()
        .catch(() => "")) || "";

    // Read selected destinations
    const destinations: string[] = [];
    const checkboxes = page.locator('input[name="dest"]:checked');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const val = await checkboxes.nth(i).getAttribute("value");
      if (val) destinations.push(val);
    }

    return {
      platform: "facebook",
      title,
      description,
      price,
      images: [],
      destinations,
    };
  }

  async submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult> {
    // Read selected destinations from checkboxes
    const destinations: string[] = [];
    const checkboxes = page.locator('input[name="dest"]:checked');
    const checkCount = await checkboxes.count();
    for (let i = 0; i < checkCount; i++) {
      const val = await checkboxes.nth(i).getAttribute("value");
      if (val) destinations.push(val);
    }
    const destination = destinations.join(",") || "marketplace";

    // Validate the approval token
    const validationResult = validateApproval(approval, {
      runId: approval?.runId ?? "",
      listingId: approval?.listingId ?? "",
      platform: "facebook",
      destination,
    });

    if (!validationResult.valid) {
      return {
        status: "failed",
        destination,
        message: `Approval rejected: ${validationResult.reason}`,
      };
    }

    // Click Publish
    const publishBtn = page.getByRole("button", { name: "Publish" });
    if (!(await publishBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination,
        message: "Publish button not found",
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
      message: "Publish may have been triggered but result is uncertain",
    };
  }
}
