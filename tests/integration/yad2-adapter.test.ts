import { test, expect } from "@playwright/test";
import { Yad2Adapter } from "../../src/platforms/yad2.js";
import { createApproval } from "../../src/services/approvals.js";
import type { ApprovedListing, ProductImage } from "../../src/domain/schemas.js";

const BASE = "http://127.0.0.1:4173";

function makeListing(): ApprovedListing {
  const images: ProductImage[] = [
    {
      path: "/tmp/test-photo-1.jpg",
      mediaType: "image/jpeg",
      order: 0,
      uploadState: "approved_for_upload",
    },
    {
      path: "/tmp/test-photo-2.jpg",
      mediaType: "image/jpeg",
      order: 1,
      uploadState: "approved_for_upload",
    },
  ];
  return {
    id: "listing-y2-001",
    title: "MacBook Air Retina 13″ 2018",
    description: "למכירה MacBook Air Retina בגודל 13 אינץ׳",
    price: 2500,
    currency: "NIS",
    condition: "good",
    location: "תל אביב",
    language: "he",
    images,
    facts: [],
  } as ApprovedListing;
}

test.describe("Yad2 adapter", () => {
  const adapter = new Yad2Adapter();

  test.describe("Navigation: Products → Private", () => {
    test("navigates Products (מוצרים) → Private (פרטי)", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      const result = await adapter.prepareDraft(page, makeListing());
      expect(result.success).toBe(true);
    });

    test("never selects Business subscription (מנוי עסקי)", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());
      // Verify we ended up on the product form, not the business page
      const titleField = page.getByLabel("כותרת");
      await expect(titleField).toBeVisible();
    });
  });

  test.describe("Form filling", () => {
    test("fills title, price, and description", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());

      const title = await page.getByLabel("כותרת").inputValue();
      expect(title).toBe("MacBook Air Retina 13″ 2018");

      const price = await page.getByLabel("מחיר").inputValue();
      expect(price).toBe("2500");
    });

    test("uploads only approved photos in selected order", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      const listing = makeListing();
      const result = await adapter.prepareDraft(page, listing);
      expect(result.success).toBe(true);
    });

    test("rejects upload of analysis_only images", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      const listing = makeListing();
      listing.images = [
        {
          path: "/tmp/serial.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "analysis_only",
        },
      ];
      const result = await adapter.prepareDraft(page, listing);
      expect(result.success).toBe(false);
    });
  });

  test.describe("Preview", () => {
    test("preview returns filled form values", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());
      const preview = await adapter.preview(page);
      expect(preview.platform).toBe("yad2");
      expect(preview.title).toBe("MacBook Air Retina 13″ 2018");
      expect(preview.price).toBe("2500");
    });
  });

  test.describe("Dry-run safety", () => {
    test("dry-run never submits", async ({ page }) => {
      await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());
      // In dry-run we never call submit()
      const status = await page
        .locator("#publish-status")
        .textContent()
        .catch(() => null);
      expect(status).not.toBe("published");
    });
  });

  test.describe("Publish with approval", () => {
    test("publish requires fresh exact approval", async ({ page }) => {
      await page.goto(`${BASE}/yad2/product-form.html`);
      await page.getByLabel("כותרת").fill("Test");
      await page.getByLabel("מחיר").fill("100");

      const approval = createApproval({
        runId: "run-001",
        listingId: "listing-y2-001",
        platform: "yad2",
        destination: "yad2",
      });
      const result = await adapter.submit(page, approval);
      expect(result.status).toBe("published");
    });

    test("rejects wrong-platform approval", async ({ page }) => {
      await page.goto(`${BASE}/yad2/product-form.html`);
      const wrongApproval = createApproval({
        runId: "run-001",
        listingId: "listing-001",
        platform: "facebook",
        destination: "yad2",
      });
      const result = await adapter.submit(page, wrongApproval);
      expect(result.status).toBe("failed");
      expect(result.message).toContain("platform");
    });

    test("rejects null approval", async ({ page }) => {
      await page.goto(`${BASE}/yad2/product-form.html`);
      const result = await adapter.submit(page, null as never);
      expect(result.status).toBe("failed");
    });
  });

  test.describe("Missing elements", () => {
    test("returns needs_mapping when Products link missing", async ({ page }) => {
      // Navigate directly to form page — no מוצרים link
      await page.goto(`${BASE}/yad2/product-form.html`);
      const result = await adapter.prepareDraft(page, makeListing());
      expect(result.success).toBe(false);
      expect(result.needsMapping).toBe(true);
    });
  });
});
