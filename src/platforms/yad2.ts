import type { Page } from "playwright";
import {
  BasePlatformAdapter,
  type DraftContext,
  type DraftResult,
  type PlatformPreview,
  type SubmissionResult,
} from "./platform-adapter.js";
import { detectChallenge } from "../browser/challenge-detector.js";
import type { ApprovedListing, ItemCondition } from "../domain/schemas.js";
import type { ApprovalToken } from "../services/approvals.js";
import { validateApproval } from "../services/approvals.js";
import { getUploadableImages, validateUploadManifest } from "../domain/schemas.js";
import type { SellerAddress } from "../domain/config.js";

/** Real Yad2 second-hand product form (mapped from live DOM, Sep 2026) */
const Y2_CREATE_URL = "https://www.yad2.co.il/publish-ad-products/create";

/** Condition toggle labels on the real form */
const Y2_CONDITION_LABEL: Record<ItemCondition, string> = {
  new: "חדש באריזה",
  like_new: "כמו חדש",
  good: "משומש",
  fair: "משומש",
  poor: "נדרש תיקון",
};

function isRealYad2(page: Page): boolean {
  return page.url().includes("yad2.co.il");
}

const YAD2_STEPS = [
  "dismiss_resume_modal",
  "upload_photos",
  "fill_title",
  "fill_type",
  "fill_description",
  "fill_condition",
  "fill_price",
  "fill_manufacturer",
  "fill_address",
  "accept_terms",
] as const;

function uniqueSteps(steps: string[]): string[] {
  return [...new Set(steps)];
}

function nextYad2Step(completed: string[]): string {
  return YAD2_STEPS.find((step) => !completed.includes(step)) ?? "done";
}

async function challengeResult(
  page: Page,
  completed: string[],
): Promise<DraftResult | null> {
  const detection = await detectChallenge(page);
  if (!detection.present || !detection.kind) return null;
  return {
    success: false,
    challenge: detection.kind,
    completedSteps: completed,
    nextStep: nextYad2Step(completed),
    error: `${detection.kind}: human verification required`,
  };
}

async function inspectYad2Progress(page: Page): Promise<string[]> {
  const completed: string[] = [];
  const titleLoc = isRealYad2(page)
    ? page.getByTestId("text-field-title")
    : page.getByLabel("כותרת");
  const titleVisible = await titleLoc.isVisible().catch(() => false);
  const title = titleVisible ? await titleLoc.inputValue().catch(() => "") : "";
  if (title.trim()) completed.push("fill_title");

  const uploadLoc = page.getByLabel("Upload count");
  const uploadVisible = await uploadLoc.isVisible().catch(() => false);
  const uploadCount = uploadVisible
    ? Number((await uploadLoc.textContent().catch(() => "0")) ?? "0")
    : 0;
  if (uploadCount > 0) completed.push("upload_photos");

  if (isRealYad2(page)) {
    const photos = await page
      .locator('[data-testid="upload-input"]')
      .locator("xpath=ancestor::*[3]")
      .locator("img")
      .count()
      .catch(() => 0);
    if (photos > 0) completed.push("upload_photos");
    const price = await page
      .getByTestId("price-input")
      .inputValue()
      .catch(() => "");
    if (price.trim()) completed.push("fill_price");
  }
  return uniqueSteps(completed);
}

function alreadyDone(completed: string[], step: string): boolean {
  return completed.includes(step);
}

export class Yad2Adapter extends BasePlatformAdapter {
  readonly name = "yad2" as const;

  /**
   * Optional product-type query for the real form's "סוג המוצר" autocomplete
   * (e.g. "מחשב נייד"). Falls back to the listing category, then title.
   */
  productType?: string;
  /** Manufacturer as listed by Yad2 (e.g. "Apple") — required for some product types */
  brand?: string;
  /** Seller pickup address for the contact modal */
  address: SellerAddress = {};
  /** Things the user must check by hand before publishing */
  reviewNotes: string[] = [];

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    // Real site: header avatar / profile menu
    const profile = page.getByTestId("profile-menu-button").first();
    if (await profile.isVisible().catch(() => false)) return "logged_in";

    // Fixture
    const publish = page.locator('[aria-label="Publish"]').first();
    if (await publish.isVisible().catch(() => false)) return "logged_in";

    const login = page
      .locator(
        '[aria-label="התחברות"], a:has-text("התחברות"), button:has-text("התחברות")',
      )
      .first();
    if (await login.isVisible().catch(() => false)) return "login_required";

    return "unknown";
  }

  async prepareDraft(
    page: Page,
    listing: ApprovedListing,
    context?: DraftContext,
  ): Promise<DraftResult> {
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

      const inferred = await inspectYad2Progress(page);
      const completed = uniqueSteps([...(context?.completedSteps ?? []), ...inferred]);
      const blocked = await challengeResult(page, completed);
      if (blocked) return blocked;

      if (isRealYad2(page)) {
        return await this.prepareRealDraft(
          page,
          listing,
          uploadable.map((i) => i.path),
          context,
          completed,
        );
      }
      return await this.prepareFixtureDraft(
        page,
        listing,
        uploadable.map((i) => i.path),
        context,
        completed,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /** Pick the first suggestion of a Yad2 autocomplete after typing into it */
  private async fillAutocomplete(
    page: Page,
    testId: string,
    query: string,
    attempts = 2,
  ): Promise<boolean> {
    const field = page.getByTestId(testId);
    const option = page
      .locator(
        'ul[class*="autocomplete-list"][role="listbox"] [data-testid="dropdown-item"]:visible',
      )
      .first();
    for (let i = 0; i < attempts; i++) {
      await field.click();
      await field.fill("");
      await field.pressSequentially(query, { delay: 40 });
      try {
        await option.waitFor({ state: "visible", timeout: 6_000 });
      } catch {
        continue;
      }
      await option.click();
      await page.waitForTimeout(500);
      return true;
    }
    return false;
  }

  private async prepareRealDraft(
    page: Page,
    listing: ApprovedListing,
    files: string[],
    context: DraftContext | undefined,
    started: string[],
  ): Promise<DraftResult> {
    const resuming = Boolean(
      context?.resumeFrom || (context?.completedSteps?.length ?? 0) > 0,
    );
    const completed = [...started];
    const onCreate = page.url().includes("publish-ad-products/create");
    if (!resuming || !onCreate) {
      await page.goto(Y2_CREATE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    }
    const blockedNow = await challengeResult(page, completed);
    if (blockedNow) return blockedNow;
    const startFresh = page.getByRole("button", { name: "התחלה מחדש" });
    const title = page.getByTestId("text-field-title");
    if (!resuming && !alreadyDone(completed, "dismiss_resume_modal")) {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        const mid = await challengeResult(page, completed);
        if (mid) return mid;
        if (await startFresh.isVisible().catch(() => false)) {
          await startFresh.click().catch(() => {});
          await page.waitForTimeout(1_000);
          break;
        }
        await page.waitForTimeout(400);
      }
      completed.push("dismiss_resume_modal");
    }
    try {
      await title.waitFor({ state: "attached", timeout: 30_000 });
      await title.scrollIntoViewIfNeeded().catch(() => {});
    } catch {
      await page
        .screenshot({
          path: ".shark/snapshots/yad2-form-load-fail.png",
          fullPage: true,
        })
        .catch(() => {});
      return {
        success: false,
        needsMapping: true,
        error: "Yad2 product form did not load (title field missing) — needs_mapping",
      };
    }
    await page
      .getByTestId("cookie-implementation-disclaimer-submit-button")
      .click({ timeout: 2_000 })
      .catch(() => {});
    if (!resuming) {
      await page
        .getByRole("button", { name: "התחלה מחדש" })
        .click({ timeout: 2_000 })
        .catch(() => {});
      await page.waitForTimeout(500);
    }

    const upload = page.locator('input[type="file"]').first();
    if (!alreadyDone(completed, "upload_photos")) {
      if ((await upload.count()) === 0) {
        return {
          success: false,
          needsMapping: true,
          error: "Photo upload input not found — needs_mapping",
        };
      }
      await upload.setInputFiles(files);
      await page.waitForTimeout(2_500);
      completed.push("upload_photos");
    }
    const photoCount = await page
      .locator('[data-testid="upload-input"]')
      .locator("xpath=ancestor::*[3]")
      .locator("img")
      .count()
      .catch(() => -1);
    if (photoCount > files.length) {
      this.reviewNotes.push(
        `${photoCount} photos on the form but ${files.length} uploaded — a restored draft added extras; remove them`,
      );
    }

    const midFill = await challengeResult(page, completed);
    if (midFill) return midFill;
    if (!alreadyDone(completed, "fill_title")) {
      await title.fill(listing.title);
      completed.push("fill_title");
    }

    const typeQuery = this.productType ?? listing.category ?? listing.title;
    const typeOk = alreadyDone(completed, "fill_type")
      ? true
      : await this.fillAutocomplete(page, "text-field-type", typeQuery);
    if (!typeOk) {
      await page
        .screenshot({ path: ".shark/snapshots/yad2-type-fail.png", fullPage: true })
        .catch(() => {});
      return {
        success: false,
        needsMapping: true,
        error: `No product type matched "${typeQuery}" — pass --yad2-type with a Yad2 category name`,
      };
    }
    if (!alreadyDone(completed, "fill_type")) completed.push("fill_type");

    if (!alreadyDone(completed, "fill_description")) {
      await page.getByTestId("text-area").fill(listing.description);
      completed.push("fill_description");
    }

    const conditionLabel = Y2_CONDITION_LABEL[listing.condition];
    const toggle = page
      .getByTestId("toggle-button-input")
      .filter({ hasText: conditionLabel })
      .first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }

    if (!alreadyDone(completed, "fill_price")) {
      await page.getByTestId("price-input").fill(String(listing.price));
      completed.push("fill_price");
    }

    // Manufacturer (required for some types) — read-only input opening a menu
    const mfr = page.getByTestId("text-field-manufacture");
    if (await mfr.isVisible().catch(() => false)) {
      if (this.brand) {
        await mfr.click();
        const item = page
          .locator('ul[class*="menu-dropdown"] li:visible')
          .filter({ hasText: this.brand })
          .first();
        if (await item.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await item.click();
        } else {
          await page.keyboard.press("Escape");
          this.reviewNotes.push(
            `Manufacturer "${this.brand}" not in Yad2 list — pick it manually`,
          );
        }
      } else {
        this.reviewNotes.push(
          "Manufacturer (יצרן) is required — pass --yad2-brand or pick manually",
        );
      }
    }

    // Contact & pickup address live in a modal behind "עריכה".
    // City/street/house are all pick-from-list fields.
    const addr = {
      city: this.address.city ?? listing.location,
      street: this.address.street,
      houseNumber: this.address.houseNumber,
    };
    if (addr.city) {
      await page.getByTestId("edit-button").click();
      const cityField = page.getByTestId("text-field-cityId");
      if (await cityField.isVisible({ timeout: 5_000 }).catch(() => false)) {
        let ok = await this.fillAutocomplete(page, "text-field-cityId", addr.city);
        if (ok && addr.street) {
          ok = await this.fillAutocomplete(page, "text-field-streetId", addr.street);
        }
        if (ok && addr.street && addr.houseNumber) {
          ok = await this.fillAutocomplete(
            page,
            "text-field-homeNumber",
            addr.houseNumber,
          );
        }
        if (ok) {
          await page
            .getByRole("button", { name: "עדכון" })
            .click()
            .catch(() => {});
          await page.waitForTimeout(800);
        }
        // Modal still open => Yad2 rejected something (e.g. missing house number)
        if (
          await page
            .getByTestId("modal-close-button")
            .isVisible()
            .catch(() => false)
        ) {
          await page
            .getByTestId("modal-close-button")
            .click()
            .catch(() => {});
          this.reviewNotes.push(
            "Address not accepted — set seller.city/street/houseNumber in shark.config.json or fix manually",
          );
        }
      }
    } else {
      this.reviewNotes.push("No pickup address — set seller.* in shark.config.json");
    }

    // Terms checkbox — required before submit; not a submission by itself.
    // The native input is visually hidden; click its label.
    const eula = page.getByTestId("checkbox-input");
    if ((await eula.count()) > 0 && !(await eula.isChecked().catch(() => true))) {
      await eula
        .evaluate((el) => {
          const input = el as HTMLInputElement;
          const label =
            input.closest("label") ??
            document.querySelector(`label[for="${input.id}"]`);
          (label ?? input).click();
        })
        .catch(() => {});
    }

    return {
      success: true,
      completedSteps: uniqueSteps(completed),
      completedActions: ["upload_images", "create_draft"],
      nextStep: "done",
    };
  }

  private async prepareFixtureDraft(
    page: Page,
    listing: ApprovedListing,
    files: string[],
    context: DraftContext | undefined,
    started: string[],
  ): Promise<DraftResult> {
    const resuming = Boolean(
      context?.resumeFrom || (context?.completedSteps?.length ?? 0) > 0,
    );
    const completed = [...started];
    const titleInput = page.getByLabel("כותרת");
    const formVisible = await titleInput.isVisible().catch(() => false);
    const productsLink = page.getByLabel("מוצרים");

    if (
      formVisible &&
      !resuming &&
      !(await productsLink.isVisible().catch(() => false))
    ) {
      return {
        success: false,
        needsMapping: true,
        error: "Products (מוצרים) link not found — needs_mapping",
      };
    }

    if (!formVisible) {
      if (resuming) {
        return {
          success: false,
          needsMapping: true,
          error: "Yad2 page is not the product form — needs_mapping",
          completedSteps: completed,
        };
      }
      if (!(await productsLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Products (מוצרים) link not found — needs_mapping",
        };
      }
      await productsLink.click();
      await page.waitForLoadState("domcontentloaded");

      const privateLink = page.getByLabel("פרטי");
      if (!(await privateLink.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Private (פרטי) option not found — needs_mapping",
        };
      }
      await privateLink.click();
      await page.waitForLoadState("domcontentloaded");
    }

    if (!(await titleInput.isVisible().catch(() => false))) {
      return {
        success: false,
        needsMapping: true,
        error: "Title (כותרת) field not found — needs_mapping",
      };
    }

    if (!alreadyDone(completed, "fill_title")) {
      await titleInput.fill(listing.title);
      completed.push("fill_title");
    }
    if (!alreadyDone(completed, "fill_price")) {
      await page.getByLabel("מחיר").fill(String(listing.price));
      completed.push("fill_price");
    }

    const descField = page.getByLabel("תיאור");
    if (
      !alreadyDone(completed, "fill_description") &&
      (await descField.isVisible().catch(() => false))
    ) {
      await descField.fill(listing.description);
      completed.push("fill_description");
    }

    const cityField = page.getByLabel("עיר");
    if (await cityField.isVisible().catch(() => false)) {
      await cityField.fill(listing.location);
    }

    const photoInput = page.getByLabel("הוספת תמונות");
    if (
      !alreadyDone(completed, "upload_photos") &&
      (await photoInput.isVisible().catch(() => false))
    ) {
      await photoInput.setInputFiles(files);
      completed.push("upload_photos");
    }

    return {
      success: true,
      completedSteps: uniqueSteps(completed),
      completedActions: ["upload_images", "create_draft"],
      nextStep: "done",
    };
  }

  async preview(page: Page): Promise<PlatformPreview> {
    const real = isRealYad2(page);
    const read = async (real_: string, fixture: string): Promise<string> =>
      (await (real ? page.getByTestId(real_) : page.getByLabel(fixture))
        .inputValue()
        .catch(() => "")) || "";

    return {
      platform: "yad2",
      title: await read("text-field-title", "כותרת"),
      description: await read("text-area", "תיאור"),
      price: await read("price-input", "מחיר"),
      images: [],
      destinations: ["yad2"],
    };
  }

  async submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult> {
    const destination = "yad2";

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

    const publishBtn = isRealYad2(page)
      ? page.getByRole("button", { name: "סיום והעלאה" })
      : page.getByLabel("פרסום");
    if (!(await publishBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination,
        message: "Publish button not found",
      };
    }

    const before = page.url();
    await publishBtn.click();

    if (isRealYad2(page)) {
      // Success = navigated away from the create form
      const navigated = await page
        .waitForURL((u) => u.toString() !== before && !u.pathname.endsWith("/create"), {
          timeout: 30_000,
        })
        .then(() => true)
        .catch(() => false);
      if (navigated) return { status: "published", destination };
      return {
        status: "unknown_submission_state",
        destination,
        message:
          "Clicked סיום והעלאה but still on the form — check for validation errors",
      };
    }

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
