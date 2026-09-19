import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireRunLock, RunLockedError } from "../../src/services/run-lock.js";

describe("run lock", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shark-lock-"));
  });

  it("allows a single owner to lock a run", async () => {
    const lock = await acquireRunLock(dir, "run-1");
    expect(lock.runId).toBe("run-1");
    await lock.release();
  });

  it("rejects a second concurrent resume of the same run", async () => {
    const first = await acquireRunLock(dir, "run-1");
    await expect(acquireRunLock(dir, "run-1")).rejects.toBeInstanceOf(RunLockedError);
    await first.release();
    const second = await acquireRunLock(dir, "run-1");
    await second.release();
  });

  it("does not persist cookies or captcha tokens in the lock file", async () => {
    const lock = await acquireRunLock(dir, "run-1");
    const raw = await (
      await import("node:fs/promises")
    ).readFile(join(dir, "run-1.lock"), "utf-8");
    const lower = raw.toLowerCase();
    expect(lower).not.toContain("cookie");
    expect(lower).not.toContain("captcha");
    expect(lower).not.toContain("token");
    expect(lower).not.toContain("hcaptcha");
    await lock.release();
  });

  it("ignores a stale lock from a dead pid", async () => {
    await writeFile(
      join(dir, "run-1.lock"),
      JSON.stringify({ pid: 99999999, createdAt: new Date().toISOString() }),
      "utf-8",
    );
    const lock = await acquireRunLock(dir, "run-1");
    await lock.release();
  });
});
