import assert from "node:assert/strict";
import test from "node:test";
import { detectLoginState } from "../cli/lib/login-detect.mjs";

function pageWith(selectors) {
  return { locator(selector) { return { first() { return this; }, async count() { return selectors.includes(selector) ? 1 : 0; }, async isVisible() { return selectors.includes(selector); } }; } };
}

for (const selector of ['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="challenges.cloudflare.com"]']) {
  test(`challenge takes priority over signed-in signals: ${selector}`, async () => {
    const state = await detectLoginState(pageWith([selector, '[aria-label="Your profile"]']));
    assert.equal(state.state, "unknown");
    assert.equal(state.checkpoint, selector);
  });
}

test("Facebook email login field is detected", async () => {
  assert.equal((await detectLoginState(pageWith(['input[name="email"]']))).state, "login_required");
});
