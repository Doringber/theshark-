import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../cli/shark.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("draft prints a listing using only facts supplied by the user", () => {
  const result = run([
    "draft",
    "--title",
    "Oak desk",
    "--price",
    "120",
    "--condition",
    "good",
    "--location",
    "Haifa",
    "--details",
    "Solid wood, small scratch on top",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Oak desk/);
  assert.match(result.stdout, /120/);
  assert.match(result.stdout, /Haifa/);
  assert.match(result.stdout, /small scratch on top/);
  assert.match(result.stdout, /Draft only/);
});

test("draft refuses missing facts instead of filling them in", () => {
  const result = run(["draft", "--title", "Oak desk"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Required/);
});

test("help is available without any setup", () => {
  const result = run(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /shark draft/);
});

test("publishing is not a CLI command", () => {
  const result = run(["publish"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: publish/);
});

test("help documents browser session commands", () => {
  const result = run(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /shark browser/);
  assert.match(result.stdout, /shark auth/);
  assert.match(result.stdout, /shark fill/);
  assert.match(result.stdout, /whatsapp/);
});

test("auth requires a platform", () => {
  const result = run(["auth"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --platform/);
});

test("fill requires a platform", () => {
  const result = run([
    "fill",
    "--title",
    "Desk",
    "--price",
    "100",
    "--condition",
    "good",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --platform/);
});
