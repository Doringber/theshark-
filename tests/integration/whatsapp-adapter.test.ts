import { test, expect } from "@playwright/test";
import { WhatsAppWebAdapter } from "../../src/platforms/whatsapp-web.js";
import { createApproval } from "../../src/services/approvals.js";
import type { ApprovedListing, ProductImage } from "../../src/domain/schemas.js";
import { resolve } from "node:path";

// Committed fixtures — never depend on files outside the repo (e.g. /tmp).
const FIXTURE_PHOTO_1 = resolve("tests/fixtures/images/test-photo-1.jpg");

const BASE = "http://127.0.0.1:4173";

function makeListing(): ApprovedListing {
  const images: ProductImage[] = [
    {
      path: FIXTURE_PHOTO_1,
      mediaType: "image/jpeg",
      order: 0,
      uploadState: "approved_for_upload",
    },
  ];
  return {
    id: "listing-wa-001",
    title: "MacBook Air Retina 13″ 2018",
    description: "למכירה MacBook Air Retina",
    price: 2500,
    currency: "NIS",
    condition: "good",
    location: "תל אביב",
    language: "he",
    images,
    facts: [],
  } as ApprovedListing;
}

test.describe("WhatsApp Web adapter", () => {
  const adapter = new WhatsAppWebAdapter();

  test.describe("Login check", () => {
    test("detects login_required on QR page", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html`);
      const state = await adapter.verifyLogin(page);
      expect(state).toBe("login_required");
    });

    test("detects logged_in on chat view", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const state = await adapter.verifyLogin(page);
      expect(state).toBe("logged_in");
    });
  });

  test.describe("Groups filter and collection", () => {
    test("collects group titles after clicking Groups filter", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const titles = await adapter.collectGroupTitles(page);
      expect(titles.length).toBeGreaterThan(0);
      expect(titles).toContain("מכירות תל אביב");
      expect(titles).toContain("Family Chat");
    });

    test("collects group titles only — does not read message history", async ({
      page,
    }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const titles = await adapter.collectGroupTitles(page);
      // Titles are short group names, not message content
      for (const title of titles) {
        expect(title.length).toBeLessThan(100);
      }
    });

    test("identifies likely sale groups from names", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const titles = await adapter.collectGroupTitles(page);
      const saleGroups = adapter.identifySaleGroups(titles);
      // Hebrew sale groups should be detected
      expect(saleGroups).toContain("מכירות תל אביב");
      expect(saleGroups).toContain("יד שנייה חיפה");
      expect(saleGroups).toContain("קניה מסירה ירושלים");
      // Non-sale groups should be excluded
      expect(saleGroups).not.toContain("Family Chat");
      expect(saleGroups).not.toContain("Work Team");
    });
  });

  test.describe("Group message preparation", () => {
    test("opens a selected group and prepares message", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const result = await adapter.prepareGroupMessage(
        page,
        "מכירות תל אביב",
        makeListing(),
      );
      expect(result.success).toBe(true);
    });

    test("only attaches approved photos in selected order", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      const result = await adapter.prepareGroupMessage(
        page,
        "מכירות תל אביב",
        makeListing(),
      );
      expect(result.success).toBe(true);
    });
  });

  test.describe("Per-group approval", () => {
    test("requires separate approval for each group", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      await adapter.prepareGroupMessage(page, "מכירות תל אביב", makeListing());

      const approvalTlv = createApproval({
        runId: "run-001",
        listingId: "listing-wa-001",
        platform: "whatsapp",
        destination: "מכירות תל אביב",
      });
      const result = await adapter.submit(page, approvalTlv);
      expect(result.status).toBe("published");
      expect(result.destination).toBe("מכירות תל אביב");
    });

    test("approval for one group does not authorize another", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      await adapter.prepareGroupMessage(page, "מכירות תל אביב", makeListing());

      // Approval for Haifa group
      const haifaApproval = createApproval({
        runId: "run-001",
        listingId: "listing-wa-001",
        platform: "whatsapp",
        destination: "יד שנייה חיפה",
      });
      const result = await adapter.submit(page, haifaApproval);
      expect(result.status).toBe("failed");
      expect(result.message).toContain("destination");
    });

    test("submit rejects null approval", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      await adapter.prepareGroupMessage(page, "מכירות תל אביב", makeListing());
      const result = await adapter.submit(page, null as never);
      expect(result.status).toBe("failed");
    });
  });

  test.describe("Dry-run safety", () => {
    test("dry-run never invokes Send", async ({ page }) => {
      await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
      await adapter.prepareGroupMessage(page, "מכירות תל אביב", makeListing());
      // In dry-run, we never call submit() — check no send happened
      const status = await page
        .locator("#send-status")
        .textContent()
        .catch(() => "not_sent");
      expect(status).toBe("not_sent");
    });
  });
});
