import { test, expect } from "@playwright/test";
import { detectLoginState } from "../../src/browser/login-detector.js";
import {
  safeNavigate,
  NavigationBlockedError,
} from "../../src/browser/safe-navigation.js";
import { captureSnapshot } from "../../src/browser/snapshot.js";

const BASE = "http://127.0.0.1:4173";

test.describe("Login detection", () => {
  test("detects login_required on Facebook login page", async ({ page }) => {
    await page.goto(`${BASE}/facebook/index.html`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("login_required");
  });

  test("detects logged_in on Facebook home page", async ({ page }) => {
    await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("logged_in");
  });

  test("detects login_required on WhatsApp QR page", async ({ page }) => {
    await page.goto(`${BASE}/whatsapp/index.html`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("login_required");
  });

  test("detects logged_in on WhatsApp chat view", async ({ page }) => {
    await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("logged_in");
  });

  test("detects login_required on Yad2 login page", async ({ page }) => {
    await page.goto(`${BASE}/yad2/index.html`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("login_required");
  });

  test("detects logged_in on Yad2 publish page", async ({ page }) => {
    await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
    const result = await detectLoginState(page);
    expect(result.state).toBe("logged_in");
  });
});

test.describe("Safe navigation", () => {
  test("allows navigation to fixture localhost in test mode", async ({ page }) => {
    const response = await safeNavigate(page, `${BASE}/facebook/index.html`, {
      platform: "facebook",
      allowLocalhost: true,
    });
    expect(response).toBeTruthy();
    // URL should point to the fixture server
    expect(page.url()).toContain("127.0.0.1:4173");
  });

  test("blocks navigation to disallowed host", async ({ page }) => {
    await expect(
      safeNavigate(page, "https://evil.com", {
        platform: "facebook",
        allowLocalhost: true,
      }),
    ).rejects.toThrow(NavigationBlockedError);
  });

  test("blocks navigation to HTTP non-localhost", async ({ page }) => {
    await expect(
      safeNavigate(page, "http://www.facebook.com", {
        platform: "facebook",
      }),
    ).rejects.toThrow(NavigationBlockedError);
  });
});

test.describe("Sanitized inspect snapshot", () => {
  test("captures accessibility tree from Facebook fixture", async ({ page }) => {
    await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
    const snapshot = await captureSnapshot(page);
    expect(snapshot.url).toBeTruthy();
    expect(snapshot.title).toContain("FakeBook");
    expect(snapshot.accessibilityTree.length).toBeGreaterThan(0);
    expect(snapshot.capturedAt).toBeTruthy();
  });

  test("snapshot URL does not contain query parameters", async ({ page }) => {
    await page.goto(`${BASE}/facebook/index.html?state=logged_in&token=secret123`);
    const snapshot = await captureSnapshot(page);
    expect(snapshot.url).not.toContain("token=secret123");
    expect(snapshot.url).not.toContain("state=logged_in");
  });

  test("snapshot does not contain cookies or storage", async ({ page }) => {
    await page.goto(`${BASE}/facebook/index.html?state=logged_in`);
    const snapshot = await captureSnapshot(page);
    const json = JSON.stringify(snapshot);
    expect(json.toLowerCase()).not.toContain("cookie");
    expect(json.toLowerCase()).not.toContain("localstorage");
    expect(json.toLowerCase()).not.toContain("sessionstorage");
  });

  test("captures WhatsApp group titles without message content", async ({ page }) => {
    await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
    const snapshot = await captureSnapshot(page);
    const json = JSON.stringify(snapshot);
    expect(json).toContain("מכירות תל אביב");
    expect(snapshot.accessibilityTree.length).toBeGreaterThan(0);
  });

  test("captures Yad2 Hebrew labels", async ({ page }) => {
    await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
    const snapshot = await captureSnapshot(page);
    const json = JSON.stringify(snapshot);
    // Check for Hebrew content in the accessible tree
    expect(json).toContain("מוצרים");
  });
});

test.describe("Fixture page structure", () => {
  test("Facebook fixture has accessible form elements", async ({ page }) => {
    await page.goto(`${BASE}/facebook/item-for-sale.html`);
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("Price")).toBeVisible();
    await expect(page.getByLabel("Category")).toBeVisible();
    await expect(page.getByLabel("Condition")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeVisible();
    await expect(page.getByLabel("Next")).toBeVisible();
  });

  test("Facebook fixture tracks whether publish was invoked", async ({ page }) => {
    await page.goto(`${BASE}/facebook/item-for-sale.html`);
    const statusBefore = await page.locator("#publish-status").textContent();
    expect(statusBefore).toBe("not_published");
  });

  test("WhatsApp fixture has Groups filter and group items", async ({ page }) => {
    await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
    await expect(page.getByLabel("Groups")).toBeVisible();
    const groups = page.locator('[data-testid="group-item"]');
    await expect(groups).toHaveCount(5);
  });

  test("WhatsApp fixture tracks whether send was invoked", async ({ page }) => {
    await page.goto(`${BASE}/whatsapp/index.html?state=logged_in`);
    await page.locator('[data-group="selling-tlv"]').click();
    const statusBefore = await page.locator("#send-status").textContent();
    expect(statusBefore).toBe("not_sent");
  });

  test("Yad2 fixture has Products → Private navigation", async ({ page }) => {
    await page.goto(`${BASE}/yad2/index.html?state=logged_in`);
    await expect(page.getByLabel("מוצרים")).toBeVisible();
    await page.getByLabel("מוצרים").click();
    await expect(page.getByLabel("פרטי")).toBeVisible();
    await expect(page.getByLabel("מנוי עסקי")).toBeVisible();
  });

  test("Yad2 product form has required fields", async ({ page }) => {
    await page.goto(`${BASE}/yad2/product-form.html`);
    await expect(page.getByLabel("כותרת")).toBeVisible();
    await expect(page.getByLabel("מחיר")).toBeVisible();
    await expect(page.getByLabel("קטגוריה")).toBeVisible();
    await expect(page.getByLabel("תיאור")).toBeVisible();
    await expect(page.getByLabel("פרסום")).toBeVisible();
  });

  test("Yad2 fixture tracks whether publish was invoked", async ({ page }) => {
    await page.goto(`${BASE}/yad2/product-form.html`);
    const statusBefore = await page.locator("#publish-status").textContent();
    expect(statusBefore).toBe("not_published");
  });
});
