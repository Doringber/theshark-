import assert from "node:assert/strict";
import test from "node:test";
import { resolveBrowserEndpoint } from "../cli/commands/browser-cmd.mjs";

test("browser uses an explicitly selected CDP endpoint without launching Chrome", async () => {
  let launched = false;
  const endpoint = await resolveBrowserEndpoint("http://127.0.0.1:9444", {
    alive: async (url) => url === "http://127.0.0.1:9444",
    launch: async () => { launched = true; return null; },
  });
  assert.equal(endpoint, "http://127.0.0.1:9444");
  assert.equal(launched, false);
});

test("browser reports an unreachable explicit endpoint instead of launching another profile", async () => {
  await assert.rejects(
    resolveBrowserEndpoint("http://127.0.0.1:9444", {
      alive: async () => false,
      launch: async () => { throw new Error("must not launch"); },
    }),
    /Cannot reach Chrome CDP/,
  );
});

test("browser launches the local Shark Chrome when no endpoint is selected", async () => {
  const endpoint = await resolveBrowserEndpoint(undefined, {
    alive: async () => { throw new Error("must not probe"); },
    launch: async () => "http://127.0.0.1:9333",
  });
  assert.equal(endpoint, "http://127.0.0.1:9333");
});
