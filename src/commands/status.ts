import { resolve } from "node:path";
import { RunStore } from "../services/run-store.js";
import { formatRunStatus } from "../services/run-status-view.js";

export async function runStatus(runId: string): Promise<void> {
  const store = new RunStore(resolve(".shark/runs"));
  const run = await store.getRun(runId);
  if (!run) {
    throw new Error(`Run "${runId}" not found`);
  }
  console.log(formatRunStatus(run));
}
