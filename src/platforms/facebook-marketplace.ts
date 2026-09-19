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

/** Map Shark condition values to real Facebook Marketplace option labels */
const FB_CONDITION_LABEL: Record<string, string> = {
  new: "New",
  like_new: "Used - Like New",
  good: "Used - Good",
  fair: "Used - Fair",
  // "poor" has no honest Facebook equivalent — handled as needs_mapping
};

export class FacebookMarketplaceAdapter extends BasePlatformAdapter {
  readonly name = "facebook" as const;

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    // Logged-in indicators: fixture ("User menu") + real FB ("Your profile")
    const userMenu = page.locator('[aria-label="User menu"]').first();
    if (await userMenu.isVisible().catch(() => false)) return "logged_in";

    const yourProfile = page.locator('[aria-label="Your profile"]').first();
    if (await yourProfile.isVisible().catch(() => false)) return "logged_in";

    const home = page.locator('[aria-label="Home"]').first();
    if (await home.isVisible().catch(() => false)) {
      // Home nav exists on real FB header even when logged out, so only
      // treat it as logged-in when no login form is present.
      const pwd = page.locator('input[type="password"]').first();
      if (!(await pwd.isVisible().catch(() => false))) return "logged_in";
    }

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

      // Category — fixture uses a native select, real FB uses a dialog picker.
      // Optional: skipped when the listing has no category.
      if (listing.category) {
        const nativeCat = page.locator('select[aria-label="Category"]');
        if (await nativeCat.isVisible().catch(() => false)) {
          await nativeCat.selectOption(listing.category).catch(() => {});
        } else {
          const catCombo = page
            .locator('[role="combobox"]', { hasText: /Category/ })
            .first();
          if (await catCombo.isVisible().catch(() => false)) {
            await catCombo.click();
            const dialog = page.locator('[role="dialog"], [role="listbox"]');
            const catOpt = dialog.getByText(listing.category, { exact: true }).first();
            if (!(await catOpt.isVisible().catch(() => false))) {
              return {
                success: false,
                needsMapping: true,
                error: `Category "${listing.category}" not found — needs_mapping`,
              };
            }
            await catOpt.click();
          }
        }
      }

      // Condition — fixture uses a native select, real FB uses a custom combobox
      const condLabel = FB_CONDITION_LABEL[listing.condition];
      if (!condLabel) {
        return {
          success: false,
          needsMapping: true,
          error: `Condition "${listing.condition}" has no Facebook equivalent — needs_mapping`,
        };
      }
      const nativeCond = page.locator('select[aria-label="Condition"]');
      if (await nativeCond.isVisible().catch(() => false)) {
        await nativeCond.selectOption(listing.condition);
      } else {
        const combo = page
          .locator('[role="combobox"]', { hasText: /Condition/ })
          .first();
        if (await combo.isVisible().catch(() => false)) {
          await combo.click();
          const dialog = page.locator('[role="dialog"], [role="listbox"]');
          const option = dialog.getByText(condLabel, { exact: true }).first();
          if (!(await option.isVisible().catch(() => false))) {
            return {
              success: false,
              needsMapping: true,
              error: `Condition option "${condLabel}" not found — needs_mapping`,
            };
          }
          await option.click();
        }
        // If no condition control is present, leave it — Category/Condition
        // pickers vary by account and are user-confirmed at preview time.
      }

      // Upload photos — fixture labels its file input, real FB hides bare
      // input[type="file"] elements behind the "Add photos" dropzone
      const photoInput = page.getByLabel("Add photos");
      if (await photoInput.isVisible().catch(() => false)) {
        const filePaths = uploadable.map((img) => img.path);
        await photoInput.setInputFiles(filePaths);
      } else {
        const fileInput = page.locator('input[type="file"]').first();
        if ((await fileInput.count().catch(() => 0)) > 0) {
          const filePaths = uploadable.map((img) => img.path);
          await fileInput.setInputFiles(filePaths);
        }
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

    // Click Publish (real FB shows Next first — advance past it)
    let publishBtn = page.getByRole("button", { name: "Publish" });
    if (!(await publishBtn.isVisible().catch(() => false))) {
      const nextBtn = page.getByRole("button", { name: "Next" });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(2000);
        publishBtn = page.getByRole("button", { name: "Publish" });
      }
    }
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
