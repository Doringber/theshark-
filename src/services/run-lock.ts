import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

export class RunLockedError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" is already in progress`);
    this.name = "RunLockedError";
  }
}

export interface RunLock {
  runId: string;
  release: () => Promise<void>;
}

interface LockFile {
  pid: number;
  createdAt: string;
}

function lockPath(storePath: string, runId: string): string {
  return join(storePath, `${runId}.lock`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireRunLock(
  storePath: string,
  runId: string,
): Promise<RunLock> {
  await mkdir(storePath, { recursive: true });
  const file = lockPath(storePath, runId);

  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as LockFile;
    if (parsed.pid && pidAlive(parsed.pid)) {
      throw new RunLockedError(runId);
    }
  } catch (error) {
    if (error instanceof RunLockedError) throw error;
    // Missing or unreadable lock — treat as free.
  }

  const payload: LockFile = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(payload, null, 2), "utf-8");

  return {
    runId,
    release: async (): Promise<void> => {
      await unlink(file).catch(() => {});
    },
  };
}
