import assert from "node:assert/strict";
import test from "node:test";
import { fillFacebookListing, fillYad2Listing } from "../cli/lib/fill-lite.mjs";

function pageStub(visible = {}) {
  const values = new Map();
  const clicks = [];
  function locator(key) {
    return {
      first() { return this; },
      async count() { return visible[key] ? 1 : 0; },
      async isVisible() { return Boolean(visible[key]); },
      async waitFor() { if (!visible[key]) throw new Error("hidden"); },
      async fill(value) { values.set(key, value); },
      async inputValue() { return values.get(key) ?? ""; },
      async click() { clicks.push(key); },
      async selectOption({ label }) { values.set(key, label); },
    };
  }
  return {
    clicks,
    async goto() {}, async bringToFront() {}, async waitForTimeout() {},
    locator,
    getByLabel: locator,
    getByTestId: locator,
    getByRole: (_role, { name }) => locator(String(name)),
  };
}
const facts = { title: "Desk", price: "100", condition: "good", location: "Haifa", details: "Scratch" };

test("Yad2 preserves an existing unrelated draft", async () => {
  const page = pageStub({ "התחלה מחדש": true });
  const result = await fillYad2Listing(page, facts);
  assert.equal(page.clicks.includes("התחלה מחדש"), false);
  assert.equal(result.status, "blocked");
});

test("Yad2 reports partial fill and verifies only fields actually read back", async () => {
  const page = pageStub({ "text-field-title": true, "text-area": true });
  const result = await fillYad2Listing(page, facts);
  assert.equal(result.status, "partial_fill");
  assert.deepEqual(result.verifiedFields, ["title", "description"]);
  assert.ok(result.missingFields.includes("price"));
  assert.ok(result.missingFields.includes("photos"));
});

test("Facebook does not select an unverified location suggestion or claim completion", async () => {
  const page = pageStub({ Title: true, Price: true, Location: true, '[role="option"], [role="menuitem"]': true });
  const result = await fillFacebookListing(page, facts);
  assert.equal(page.clicks.length, 0);
  assert.equal(result.status, "partial_fill");
  assert.deepEqual(result.verifiedFields, ["title", "price"]);
  assert.ok(result.missingFields.includes("location"));
});
