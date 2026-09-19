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

  /**
   * Facebook groups to cross-post to (exact names as shown in the
   * "List in your groups" panel). Set by the sell orchestrator from
   * explicit user input. Empty = Marketplace only.
   */
  targetGroups: string[] = [];

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

      // Navigate to the item form. On the real site go straight to the
      // create-item URL (the header create button has no stable label);
      // on fixture/test hosts keep the click-through flow.
      if (page.url().includes("facebook.com")) {
        await page.goto("https://www.facebook.com/marketplace/create/item", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page
          .getByLabel("Title")
          .waitFor({ timeout: 15_000 })
          .catch(() => {});
      } else {
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
      }

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

      const locationField = page.getByLabel("Location");
      if (await locationField.isVisible().catch(() => false)) {
        // Real FB Location is an autocomplete combobox pre-filled with the
        // account default — only overwrite when it's empty, since typing
        // without picking a suggestion invalidates the field.
        const current = await locationField.inputValue().catch(() => "");
        if (!current.trim()) {
          await locationField.fill(listing.location);
          await page.waitForTimeout(2000);
          // Accept the top autocomplete match, if any appeared.
          const suggestion = page
            .locator('[role="option"], [role="menuitem"]')
            .first();
          if (await suggestion.isVisible().catch(() => false)) {
            await suggestion.click().catch(() => {});
          } else {
            await page.keyboard.press("Enter").catch(() => {});
          }
        }
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

      // Description renders only after Category is chosen and sits below
      // the fold — scroll it in. Note: on some category forms the <label>
      // loses its "for" association, so fall back to a container-scoped fill.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const descInput = page.getByLabel("Description");
      await descInput.waitFor({ timeout: 10_000 }).catch(() => {});
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.fill(listing.description);
      } else {
        const filled = await page
          .evaluate(
            (text) => {
              const labels = Array.from(document.querySelectorAll("label"));
              const lab = labels.find(
                (l) => (l.innerText || "").trim() === "Description",
              );
              const ta =
                lab?.parentElement?.querySelector("textarea") ?? null;
              if (!ta) return false;
              const setter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value",
              )?.set;
              if (setter) setter.call(ta, text);
              else ta.value = text;
              ta.dispatchEvent(new Event("input", { bubbles: true }));
              ta.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            },
            listing.description,
          )
          .catch(() => false);
        if (!filled) {
          return {
            success: false,
            needsMapping: true,
            error: "Description field not found — needs_mapping",
          };
        }
      }

      // Upload photos — real FB hides bare input[type="file"] elements
      // behind the "Add photos" dropzone div (which also matches the
      // accessible label but is not an input); fixture labels its file
      // input directly. Prefer a real file input either way.
      const filePaths = uploadable.map((img) => img.path);
      const fileInput = page.locator('input[type="file"]').first();
      if ((await fileInput.count().catch(() => 0)) > 0) {
        await fileInput.setInputFiles(filePaths);
      } else {
        const photoInput = page.getByLabel("Add photos");
        if (await photoInput.isVisible().catch(() => false)) {
          await photoInput.setInputFiles(filePaths);
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
      price: price.replace(/^₪/, ""),
      images: [],
      // Real FB only shows destination checkboxes after Next — until then
      // the listing targets Marketplace by default (matches submit()).
      destinations: destinations.length > 0 ? destinations : ["marketplace"],
    };
  }

  async submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult> {
    // Advance through Next screens (form → meetup/boost → publish).
    // A disabled Next means a required field is unconfirmed — report it
    // honestly instead of timing out on the click.
    for (let step = 0; step < 3; step++) {
      const publishVisible = await page
        .getByRole("button", { name: "Publish", exact: true })
        .isVisible()
        .catch(() => false);
      if (publishVisible) break;

      const nextBtn = page.getByRole("button", { name: "Next", exact: true });
      if (!(await nextBtn.isVisible().catch(() => false))) break;

      const disabled = await nextBtn.getAttribute("aria-disabled").catch(() => null);
      if (disabled === "true") {
        await page.screenshot({ path: ".shark/snapshots/fb-next-disabled.png" }).catch(() => {});
        return {
          status: "needs_mapping",
          destination: "marketplace",
          message:
            "Next is disabled — a required field needs attention (see .shark/snapshots/fb-next-disabled.png)",
        };
      }

      // Keep publishing free — turn off the paid Boost step when present.
      // Match only the VISIBLE switch (earlier steps keep hidden copies in
      // the DOM) and verify the state actually flipped.
      const boostOff = await page
        .evaluate(() => {
          const visible = (e: Element): boolean => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const switches = Array.from(
            document.querySelectorAll('input[role="switch"], [role="switch"]'),
          ).filter(visible);
          const target = switches.find((e) => {
            const scope =
              e.closest("div")?.parentElement?.innerText ??
              e.getAttribute("aria-label") ??
              "";
            return scope.includes("Boost");
          });
          if (!target) return `absent:${switches.length}`;
          const isOn =
            target.getAttribute("aria-checked") === "true" ||
            (target instanceof HTMLInputElement && target.checked);
          if (isOn) (target as HTMLElement).click();
          return isOn ? "was_on" : "was_off";
        })
        .catch(() => "error");
      if (boostOff === "was_on") {
        // Re-read: a controlled switch sometimes needs a beat to flip.
        await page.waitForTimeout(1500);
        const stillOn = await page
          .evaluate(() => {
            const el = Array.from(
              document.querySelectorAll('input[role="switch"], [role="switch"]'),
            ).find((e) => {
              const r = e.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return false;
              const scope =
                e.closest("div")?.parentElement?.innerText ??
                e.getAttribute("aria-label") ??
                "";
              return scope.includes("Boost");
            });
            if (!el) return false;
            return (
              el.getAttribute("aria-checked") === "true" ||
              (el instanceof HTMLInputElement && el.checked)
            );
          })
          .catch(() => false);
        if (stillOn) {
          return {
            status: "needs_mapping",
            destination: "marketplace",
            message:
              "Could not turn off paid Boost step — refusing to publish into an ad flow",
          };
        }
      }

      await nextBtn.click();
      await page.waitForTimeout(3000);
    }

    // Cross-post to requested groups. Rows are DIV role=checkbox with
    // text "<name><members> members · <privacy>". A requested group that
    // cannot be found (or won't check) fails closed — never silently skip.
    let selectedGroups: string[] = [];
    if (this.targetGroups.length > 0) {
      const groupResult = await page
        .evaluate((names: string[]): { missing: string[]; unchecked: string[]; selected: string[] } => {
          const boxes = Array.from(
            document.querySelectorAll('[role="checkbox"]'),
          );
          const missing: string[] = [];
          const selected: string[] = [];
          for (const name of names) {
            const box = boxes.find((b) =>
              (b.textContent || "").includes(name),
            );
            if (!box) {
              missing.push(name);
              continue;
            }
            if (box.getAttribute("aria-checked") !== "true") {
              (box as HTMLElement).click();
            }
            selected.push(name);
          }
          return { missing, unchecked: [], selected };
        }, this.targetGroups)
        .catch(() => ({
          missing: [...this.targetGroups],
          unchecked: [] as string[],
          selected: [] as string[],
        }));

      if (groupResult.missing.length > 0) {
        return {
          status: "needs_mapping",
          destination: "marketplace",
          message: `Groups not found on destination screen: ${groupResult.missing.join(", ")} — needs_mapping`,
        };
      }

      // Verify the checks actually stuck.
      await page.waitForTimeout(1500);
      const verify = await page
        .evaluate((names: string[]): string[] => {
          const boxes = Array.from(
            document.querySelectorAll('[role="checkbox"]'),
          );
          return names.filter((name) => {
            const box = boxes.find((b) =>
              (b.textContent || "").includes(name),
            );
            return !box || box.getAttribute("aria-checked") !== "true";
          });
        }, groupResult.selected)
        .catch(() => [...groupResult.selected]);

      if (verify.length > 0) {
        return {
          status: "needs_mapping",
          destination: "marketplace",
          message: `Groups would not stay selected: ${verify.join(", ")} — refusing partial cross-post`,
        };
      }
      selectedGroups = groupResult.selected;
    }

    // Read selected destinations from checkboxes (present on later steps)
    const destinations: string[] = [];
    const checkboxes = page.locator('input[name="dest"]:checked');
    const checkCount = await checkboxes.count();
    for (let i = 0; i < checkCount; i++) {
      const val = await checkboxes.nth(i).getAttribute("value");
      if (val) destinations.push(val);
    }
    const baseDestination = destinations.join(",") || "marketplace";
    const destination =
      selectedGroups.length > 0
        ? [baseDestination, ...selectedGroups].join(",")
        : baseDestination;

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

    // Click Publish (reached after advancing past the Next screens).
    const publishBtn = page.getByRole("button", { name: "Publish", exact: true });
    if (!(await publishBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination,
        message: "Publish button not found",
      };
    }

    await publishBtn.click();

    // Check result — fixture signals via #publish-status, real FB navigates
    // to the new listing (or shows a confirmation).
    const fixtureStatus = await page
      .locator("#publish-status")
      .textContent({ timeout: 5_000 })
      .catch(() => null);
    if (fixtureStatus === "published") {
      return { status: "published", destination };
    }

    await page.waitForTimeout(10_000);
    await page
      .waitForURL(/marketplace\/(item|you)/i, { timeout: 15_000 })
      .catch(() => {});
    const finalUrl = page.url();
    if (/facebook\.com\/marketplace\/(item|you)/i.test(finalUrl)) {
      return { status: "published", destination, message: finalUrl };
    }

    // Still on the form — surface whatever Facebook is actually saying
    // (error toast, dialog, missing-field hint) instead of a generic error.
    const chatter = await page
      .evaluate(() => {
        const dialog = Array.from(
          document.querySelectorAll('[role="dialog"], [role="alert"]'),
        )
          .map((d) => (d as HTMLElement).innerText?.slice(0, 300))
          .filter(Boolean)
          .join(" /// ");
        return {
          dialog: dialog.slice(0, 500),
          title: document.title,
        };
      })
      .catch(() => ({ dialog: "", title: "" }));

    const bodyText = await page
      .evaluate(() => document.body.innerText.slice(0, 2000))
      .catch(() => "");
    if (
      /listing is (live|active)|your listing has been published/i.test(bodyText) ||
      /listing is (live|active)|your listing has been published/i.test(chatter.dialog)
    ) {
      return { status: "published", destination };
    }

    await page.screenshot({ path: ".shark/snapshots/fb-after-publish.png" }).catch(() => {});
    const hint = chatter.dialog ? ` Facebook says: "${chatter.dialog}"` : "";
    return {
      status: "unknown_submission_state",
      destination,
      message:
        `Publish clicked but result is uncertain.${hint} Screenshot at .shark/snapshots/fb-after-publish.png, check your Marketplace listings`,
    };
  }
}
