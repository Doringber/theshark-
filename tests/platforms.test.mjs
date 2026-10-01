import assert from "node:assert/strict";
import test from "node:test";
import { parsePlatform, PLATFORMS } from "../cli/lib/platforms.mjs";

test("parsePlatform accepts known platforms", () => {
  assert.equal(parsePlatform("facebook"), "facebook");
  assert.equal(parsePlatform(" Yad2 "), "yad2");
  assert.ok(PLATFORMS.facebook.listingUrl.includes("marketplace"));
});

test("parsePlatform rejects unknown names", () => {
  assert.throws(() => parsePlatform("ebay"), /Unknown platform/);
});
