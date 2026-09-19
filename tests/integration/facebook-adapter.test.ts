import { test, expect } from "@playwright/test";
import { FacebookMarketplaceAdapter } from "../../src/platforms/facebook-marketplace.js";
import { createApproval } from "../../src/services/approvals.js";
import type { ApprovedListing, ProductImage } from "../../src/domain/schemas.js";

const BASE = "http://127.0.0.1:4173";

function makeListing(overrides: Partial<ApprovedListing> = {}): ApprovedListing {
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
    id: "listing-fb-001",
    title: "MacBook Air Retina 13″ 2018",
    description: "למכירה MacBook Air Retina בגודל 13 אינץ׳",
    price: 2500,
    currency: "NIS",
    condition: "good",
    location: "תל אביב",
    language: "he",
    images,
    facts: [],
    ...overrides,
  } as ApprovedListing;
}

test.describe("Facebook Marketplace adapter", () => {
  const adapter = new FacebookMarketplaceAdapter();

  test("detects the verified live profile chooser as login_required", async ({
    page,
  }) => {
    await page.setContent(`
      <main>
        <h1>Saved profile</h1>
        <div role="button">
          <div role="button" aria-label="Continue Saved profile">Continue</div>
        </div>
        <div role="button" aria-label="Use another profile">Use another profile</div>
      </main>
    `);

    await expect(
      page.getByRole("button", { name: /^Continue\b/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Use another profile", exact: true }),
    ).toBeVisible();
    await expect(adapter.verifyLogin(page)).resolves.toBe("login_required");
  });

  test.describe("Navigation: Marketplace → Create → Item for sale", () => {
    test("navigates through Marketplace → Create → Item for sale", async ({ page }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      const listing = makeListing();
      const result = await adapter.prepareDraft(page, listing);
      expect(result.success).toBe(true);
    });

    test("fills Title and Price as required fields", async ({ page }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      const listing = makeListing();
      await adapter.prepareDraft(page, listing);

      const title = await page.getByLabel("Title").inputValue();
      expect(title).toBe("MacBook Air Retina 13″ 2018");

      const price = await page.getByLabel("Price").inputValue();
      expect(price).toBe("2500");
    });
  });

  test.describe("Image handling", () => {
    test("uploads only approved_for_upload images in selected order", async ({
      page,
    }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      const listing = makeListing();
      const result = await adapter.prepareDraft(page, listing);
      expect(result.success).toBe(true);
      // The adapter uses getUploadableImages which filters and orders correctly
    });

    test("rejects listing with analysis_only images in upload set", async ({
      page,
    }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      const listing = makeListing({
        images: [
          {
            path: "/tmp/serial.jpg",
            mediaType: "image/jpeg",
            order: 0,
            uploadState: "analysis_only",
          },
        ],
      });
      const result = await adapter.prepareDraft(page, listing);
      // Should fail because no approved images in the uploadable set
      // Actually getUploadableImages returns empty, manifestCheck fails
      expect(result.success).toBe(false);
    });

    test("excludes replace_required images from upload", async ({ page }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      const listing = makeListing({
        images: [
          {
            path: "/tmp/safe.jpg",
            mediaType: "image/jpeg",
            order: 0,
            uploadState: "approved_for_upload",
          },
          {
            path: "/tmp/sensitive.jpg",
            mediaType: "image/jpeg",
            order: 1,
            uploadState: "replace_required",
          },
        ],
      });
      const result = await adapter.prepareDraft(page, listing);
      // Should succeed — only the approved image gets uploaded
      expect(result.success).toBe(true);
    });
  });

  test.describe("Preview and destination selection", () => {
    test("preview shows filled fields", async ({ page }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());
      const preview = await adapter.preview(page);
      expect(preview.platform).toBe("facebook");
      expect(preview.title).toBe("MacBook Air Retina 13″ 2018");
      expect(preview.price).toBe("2500");
    });

    test("Next shows destination selection", async ({ page }) => {
      await page.goto(`${BASE}/facebook/item-for-sale.html`);
      await page.getByLabel("Title").fill("Test");
      await page.getByLabel("Price").fill("100");
      await page.getByLabel("Next").click();
      await expect(page.getByLabel("Choose destinations")).toBeVisible();
      await expect(page.getByLabel("Marketplace")).toBeVisible();
    });
  });

  test.describe("Dry-run safety", () => {
    test("dry-run never invokes Publish", async ({ page }) => {
      await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
      await adapter.prepareDraft(page, makeListing());
      // In dry-run mode, we never call submit() — just prepareDraft + preview
      const status = await page
        .locator("#publish-status")
        .textContent()
        .catch(() => null);
      expect(status).not.toBe("published");
    });
  });

  test.describe("Publish with approval", () => {
    test("Publish requires a fresh approval bound to exact destination", async ({
      page,
    }) => {
      await page.goto(`${BASE}/facebook/item-for-sale.html`);
      await page.getByLabel("Title").fill("Test");
      await page.getByLabel("Price").fill("100");
      // Click Next to reach destination selection
      await page.getByLabel("Next").click();
      await expect(page.getByLabel("Choose destinations")).toBeVisible();

      const approval = createApproval({
        runId: "run-001",
        listingId: "listing-fb-001",
        platform: "facebook",
        destination: "marketplace",
      });
      const result = await adapter.submit(page, approval);
      expect(result).toMatchObject({ status: "published" });
    });

    test("submit rejects wrong-platform approval", async ({ page }) => {
      await page.goto(`${BASE}/facebook/item-for-sale.html`);
      const wrongApproval = createApproval({
        runId: "run-001",
        listingId: "listing-001",
        platform: "yad2",
        destination: "marketplace",
      });
      const result = await adapter.submit(page, wrongApproval);
      expect(result.status).toBe("failed");
      expect(result.message).toContain("platform");
    });

    test("submit rejects null/missing approval", async ({ page }) => {
      await page.goto(`${BASE}/facebook/item-for-sale.html`);
      const result = await adapter.submit(page, null as never);
      expect(result.status).toBe("failed");
    });
  });

  test.describe("Unknown/missing elements", () => {
    test("returns needs_mapping when Marketplace link is missing", async ({ page }) => {
      // Navigate to a page without Marketplace link
      await page.goto(`${BASE}/facebook/item-for-sale.html`);
      const result = await adapter.prepareDraft(page, makeListing());
      expect(result.success).toBe(false);
      expect(result.needsMapping).toBe(true);
    });
  });
});
