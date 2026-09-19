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

function isRealWhatsApp(page: Page): boolean {
  return page.url().includes("web.whatsapp.com");
}

/** Build the short sale message posted to each chat */
export function buildWhatsAppMessage(listing: ApprovedListing): string {
  const lines = [`למכירה: ${listing.title}`, `מחיר: ₪${listing.price}`];
  if (listing.location) lines.push(`איסוף: ${listing.location}`);
  if (listing.description) lines.push("", listing.description);
  return lines.join("\n");
}

export class WhatsAppWebAdapter extends BasePlatformAdapter {
  readonly name = "whatsapp" as const;

  /** Exact chat/group names (as shown in WhatsApp) to send the listing to */
  targetChats: string[] = [];

  /** Listing captured in prepareDraft so submit can post to every target chat */
  private pendingListing: ApprovedListing | null = null;
  private pendingFiles: string[] = [];

  async verifyLogin(page: Page): Promise<"logged_in" | "login_required" | "unknown"> {
    // Real Web: sidebar search box exists only when logged in. The app is a
    // heavy SPA — give it a moment to render before deciding.
    const realSearch = page.locator('#side input[role="textbox"]').first();
    const qrCanvas = page.locator('canvas[aria-label*="QR" i], [data-ref]').first();
    if (isRealWhatsApp(page)) {
      // "WhatsApp is open in another window" — claim this tab.
      await page
        .getByRole("button", { name: "Use here" })
        .click({ timeout: 3_000 })
        .catch(() => {});
      await realSearch
        .or(qrCanvas)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
    }
    if (await realSearch.isVisible().catch(() => false)) return "logged_in";
    if (await qrCanvas.isVisible().catch(() => false)) return "login_required";

    // Fixture
    const chat = page.locator('[aria-label="Chat"]').first();
    if (await chat.isVisible().catch(() => false)) return "logged_in";
    const qr = page.locator('[aria-label="QR Login"], [data-testid="qr-code"]').first();
    if (await qr.isVisible().catch(() => false)) return "login_required";

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

      if (isRealWhatsApp(page)) {
        if (this.targetChats.length === 0) {
          return {
            success: false,
            needsMapping: true,
            error: "No WhatsApp chats selected — pass --wa-to with exact chat/group names",
          };
        }
        // Verify every target chat exists before anything is sent anywhere.
        for (const chat of this.targetChats) {
          const found = await this.openChat(page, chat);
          if (!found) {
            return {
              success: false,
              needsMapping: true,
              error: `WhatsApp chat "${chat}" not found — check the exact name`,
            };
          }
        }
        this.pendingListing = listing;
        this.pendingFiles = uploadable.map((img) => img.path);
        return { success: true };
      }

      // Fixture: verify we can see the chat view
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

  /** Real Web: search the sidebar and open a chat by exact title */
  private async openChat(page: Page, chatName: string): Promise<boolean> {
    const search = page.locator('#side input[role="textbox"]').first();
    await search.click();
    await search.fill("");
    await search.fill(chatName);
    const row = page.locator(`#pane-side span[title="${chatName.replace(/"/g, '\\"')}"]`).first();
    try {
      await row.waitFor({ state: "visible", timeout: 8_000 });
    } catch {
      await page.keyboard.press("Escape");
      return false;
    }
    await row.click();
    const composer = page.locator('#main [role="textbox"]').first();
    await composer.waitFor({ state: "visible", timeout: 8_000 });
    return true;
  }

  /** Real Web: attach photos, type caption, press Send in the open chat */
  private async sendToOpenChat(page: Page, text: string, files: string[]): Promise<boolean> {
    await page.locator('#main [aria-label="Attach"]').click();
    const photos = page.getByRole("menuitem", { name: "Photos & videos" });
    await photos.waitFor({ state: "visible", timeout: 5_000 });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), photos.click()]);
    await chooser.setFiles(files);

    const sendBtn = page.locator('[role="button"][aria-label^="Send"]').first();
    await sendBtn.waitFor({ state: "visible", timeout: 15_000 });

    const caption = page.locator('[role="textbox"][aria-placeholder="Type a message"]').first();
    await caption.waitFor({ state: "visible", timeout: 5_000 });
    await caption.click();
    // Multi-line caption: Shift+Enter keeps it in the box, Enter would send.
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.keyboard.press("Shift+Enter");
      const line = lines[i] ?? "";
      if (line) await page.keyboard.insertText(line);
    }

    await sendBtn.click();
    // Preview closes once the message is queued.
    await sendBtn.waitFor({ state: "hidden", timeout: 15_000 });
    return true;
  }

  /** Open a specific group and prepare the message (fixture flow) */
  async prepareGroupMessage(
    page: Page,
    groupName: string,
    listing: ApprovedListing,
  ): Promise<DraftResult> {
    try {
      const uploadable = getUploadableImages(listing.images);

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

      const conversation = page.locator('[aria-label="Group conversation"]');
      await conversation.waitFor({ state: "visible", timeout: 5000 });

      const attachInput = page.locator("#attachment-input");
      if (await attachInput.count()) {
        const filePaths = uploadable.map((img) => img.path);
        await attachInput.setInputFiles(filePaths);
      }

      const messageInput = page.locator('[aria-label="Type a message"]');
      if (await messageInput.isVisible().catch(() => false)) {
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
    if (isRealWhatsApp(page) && this.pendingListing) {
      return {
        platform: "whatsapp",
        title: this.targetChats.join(", "),
        description: buildWhatsAppMessage(this.pendingListing),
        price: String(this.pendingListing.price),
        images: [],
        destinations: [this.targetChats.join(",")],
      };
    }

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
    if (isRealWhatsApp(page)) {
      const destination = this.targetChats.join(",");
      const validationResult = validateApproval(approval, {
        runId: approval?.runId ?? "",
        listingId: approval?.listingId ?? "",
        platform: "whatsapp",
        destination,
      });
      if (!validationResult.valid) {
        return {
          status: "failed",
          destination,
          message: `Approval rejected: ${validationResult.reason}`,
        };
      }
      if (!this.pendingListing) {
        return { status: "failed", destination, message: "prepareDraft was not run" };
      }

      const text = buildWhatsAppMessage(this.pendingListing);
      const sent: string[] = [];
      for (const chat of this.targetChats) {
        try {
          if (!(await this.openChat(page, chat))) {
            return {
              status: "failed",
              destination,
              message: `Chat "${chat}" disappeared before sending (sent so far: ${sent.join(", ") || "none"})`,
            };
          }
          await this.sendToOpenChat(page, text, this.pendingFiles);
          sent.push(chat);
        } catch (error) {
          const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
          return {
            status: "unknown_submission_state",
            destination,
            message: `Error on "${chat}": ${msg} (sent so far: ${sent.join(", ") || "none"})`,
          };
        }
      }
      return { status: "published", destination, message: `Sent to ${sent.join(", ")}` };
    }

    // Fixture flow
    const groupName =
      (await page
        .locator("#group-name")
        .textContent()
        .catch(() => "")) || "";

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

    const sendBtn = page.getByRole("button", { name: "Send" });
    if (!(await sendBtn.isVisible().catch(() => false))) {
      return {
        status: "needs_mapping",
        destination: groupName,
        message: "Send button not found",
      };
    }

    await sendBtn.click();

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
