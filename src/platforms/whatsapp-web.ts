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

/** Hebrew sale-related keywords for group name matching */
const SALE_GROUP_KEYWORDS = [
  "מכיר",
  "קני",
  "מסיר",
  "יד שני",
  "יד2",
  "למכירה",
  "second.?hand",
  "buy.*sell",
  "selling",
];

export class WhatsAppWebAdapter extends BasePlatformAdapter {
  readonly name = "whatsapp" as const;

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    const chat = page.locator('[aria-label="Chat"]').first();
    if (await chat.isVisible().catch(() => false)) return "logged_in";

    const qr = page.locator('[aria-label="QR Login"]').first();
    if (await qr.isVisible().catch(() => false)) return "login_required";

    const qrCode = page.locator('[data-testid="qr-code"]').first();
    if (await qrCode.isVisible().catch(() => false)) return "login_required";

    return "unknown";
  }

  /** Collect visible group titles after clicking the Groups filter */
  async collectGroupTitles(page: Page): Promise<string[]> {
    const groupsFilter = page.getByLabel("Groups");
    if (await groupsFilter.isVisible().catch(() => false)) {
      await groupsFilter.click();
    }

    const items = page.locator('[data-testid="group-item"]');
    const count = await items.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await items.nth(i).getAttribute("aria-label");
      if (label) titles.push(label);
    }
    return titles;
  }

  /** Identify likely second-hand selling groups from their names */
  identifySaleGroups(titles: string[]): string[] {
    const pattern = new RegExp(SALE_GROUP_KEYWORDS.join("|"), "i");
    return titles.filter((title) => pattern.test(title));
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

      // Verify we can see the chat view
      const chatView = page.locator('[aria-label="Chat"]').first();
      if (!(await chatView.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: "Chat view not visible — needs_mapping",
        };
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /** Open a specific group and prepare the message */
  async prepareGroupMessage(
    page: Page,
    groupName: string,
    listing: ApprovedListing,
  ): Promise<DraftResult> {
    try {
      const uploadable = getUploadableImages(listing.images);

      // Click the group
      const groupItem = page.locator(
        `[data-testid="group-item"][aria-label="${groupName}"]`,
      );
      if (!(await groupItem.isVisible().catch(() => false))) {
        return {
          success: false,
          needsMapping: true,
          error: `Group "${groupName}" not found — needs_mapping`,
        };
      }
      await groupItem.click();

      // Wait for conversation view
      const conversation = page.locator('[aria-label="Group conversation"]');
      await conversation.waitFor({ state: "visible", timeout: 5000 });

      // Set attachment files
      const attachInput = page.locator("#attachment-input");
      if (await attachInput.count()) {
        const filePaths = uploadable.map((img) => img.path);
        await attachInput.setInputFiles(filePaths);
      }

      // Type the message
      const messageInput = page.locator('[aria-label="Type a message"]');
      if (await messageInput.isVisible().catch(() => false)) {
        // Build short WhatsApp message
        const msg = `למכירה ${listing.title}, מחיר ₪${listing.price}, ${listing.location}`;
        await messageInput.fill(msg);
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  async preview(page: Page): Promise<PlatformPreview> {
    const groupName =
      (await page
        .locator("#group-name")
        .textContent()
        .catch(() => "")) || "";
    const message =
      (await page
        .locator('[aria-label="Type a message"]')
        .textContent()
        .catch(() => "")) || "";

    return {
      platform: "whatsapp",
      title: groupName,
      description: message,
      price: "",
      images: [],
      destinations: groupName ? [groupName] : [],
    };
  }

  async submit(page: Page, approval: ApprovalToken): Promise<SubmissionResult> {
    const groupName =
      (await page
        .locator("#group-name")
        .textContent()
        .catch(() => "")) || "";

    // Validate the approval for this exact group
    const validationResult = validateApproval(approval, {
      runId: approval?.runId ?? "",
      listingId: approval?.listingId ?? "",
      platform: "whatsapp",
      destination: groupName,
    });

    if (!validationResult.valid) {
      return {
        status: "failed",
        destination: groupName,
        message: `Approval rejected: ${validationResult.reason}`,
      };
    }

    // Click Send
    const sendBtn = page.getByRole("button", { name: "Send" });
    if (!(await sendBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination: groupName,
        message: "Send button not found",
      };
    }

    await sendBtn.click();

    // Check result
    const status = await page.locator("#send-status").textContent();
    if (status === "sent") {
      return { status: "published", destination: groupName };
    }

    return {
      status: "unknown_submission_state",
      destination: groupName,
      message: "Send may have triggered but result uncertain",
    };
  }
}
