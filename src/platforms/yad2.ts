import type { Page } from "playwright";
import {
  BasePlatformAdapter,
  type DraftResult,
  type PlatformPreview,
  type SubmissionResult,
} from "./platform-adapter.js";
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

      if (isRealYad2(page)) {
        return await this.prepareRealDraft(
          page,
          listing,
          uploadable.map((i) => i.path),
        );
      }
      return await this.prepareFixtureDraft(
        page,
        listing,
        uploadable.map((i) => i.path),
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
  ): Promise<DraftResult> {
    await page.goto(Y2_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // "Resume saved draft?" modal — always start fresh so a stale draft never
    // leaks into a new listing. It can pop up a few seconds after the form
    // renders, so poll for it rather than click once.
    const startFresh = page.getByRole("button", { name: "התחלה מחדש" });
    const title = page.getByTestId("text-field-title");
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (await startFresh.isVisible().catch(() => false)) {
        await startFresh.click().catch(() => {});
        await page.waitForTimeout(1_000);
        break;
      }
      await page.waitForTimeout(400);
    }
    // Bot check (hCaptcha) — never bypass: hand the tab to the user and wait.
    const captcha = page
      .getByText("Are you for real")
      .or(page.locator('iframe[src*="hcaptcha"]'));
    if (
      await captcha
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await page.bringToFront().catch(() => {});
      console.log(
        "  🤖 Yad2 is showing a captcha — please solve it in the Shark Chrome tab (waiting up to 3 min)...",
      );
      await title.waitFor({ state: "attached", timeout: 180_000 }).catch(() => {});
      if (!(await title.count())) {
        return {
          success: false,
          needsMapping: false,
          error:
            'captcha: Yad2 bot check not solved — the tab stays open; tick "I am human" there and re-run',
        };
      }
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
    await page
      .getByRole("button", { name: "התחלה מחדש" })
      .click({ timeout: 2_000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Photos — hidden <input type=file data-testid="upload-input">
    const upload = page.locator('input[type="file"]').first();
    if ((await upload.count()) === 0) {
      return {
        success: false,
        needsMapping: true,
        error: "Photo upload input not found — needs_mapping",
      };
    }
    await upload.setInputFiles(files);
    await page.waitForTimeout(2_500);
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

    await title.fill(listing.title);

    // Product type (required autocomplete). Its choice may reveal extra
    // required fields (e.g. manufacturer) that we leave for user review.
    const typeQuery = this.productType ?? listing.category ?? listing.title;
    const typeOk = await this.fillAutocomplete(page, "text-field-type", typeQuery);
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

    await page.getByTestId("text-area").fill(listing.description);

    const conditionLabel = Y2_CONDITION_LABEL[listing.condition];
    const toggle = page
      .getByTestId("toggle-button-input")
      .filter({ hasText: conditionLabel })
      .first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }

    await page.getByTestId("price-input").fill(String(listing.price));

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

    return { success: true };
  }

  private async prepareFixtureDraft(
    page: Page,
    listing: ApprovedListing,
    files: string[],
  ): Promise<DraftResult> {
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
    await privateLink.click();
    await page.waitForLoadState("domcontentloaded");

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

    const photoInput = page.getByLabel("הוספת תמונות");
    if (await photoInput.isVisible().catch(() => false)) {
      await photoInput.setInputFiles(files);
    }

    return { success: true };
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
