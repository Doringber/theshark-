import type { RunRecord } from "./run-store.js";

const PLATFORM_TITLE: Record<string, string> = {
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  yad2: "Yad2",
};

export function formatRunStatus(
  run: RunRecord,
  options: { timedOut?: boolean } = {},
): string {
  const lines: string[] = [`Run ${run.id}`, ""];
  const platforms = run.platforms.length
    ? run.platforms
    : [...new Set(run.destinations.map((d) => d.platform))];

  for (const platform of platforms) {
    const dests = run.destinations.filter((d) => d.platform === platform);
    const title = PLATFORM_TITLE[platform] ?? platform;
    lines.push(`${title.padEnd(10)} ${describePlatform(platform, dests)}`);
  }

  lines.push("");
  lines.push(`Next action: ${nextAction(run, options)}`);
  if (options.timedOut) {
    lines.push(`shark resume ${run.id}`);
  }
  return lines.join("\n");
}

function describePlatform(platform: string, dests: RunRecord["destinations"]): string {
  if (dests.length === 0) return "preparing";
  if (platform === "whatsapp") {
    const submitted = dests.filter(
      (d) => d.status === "submitted" || d.status === "published",
    );
    if (submitted.length > 0) {
      const n = submitted.length;
      return `submitted to ${n} approved group${n === 1 ? "" : "s"}`;
    }
  }
  const destination = dests[0];
  if (!destination) return "preparing";
  return destination.safeMessage
    ? `${destination.status} — ${destination.safeMessage}`
    : destination.status;
}

function nextAction(run: RunRecord, options: { timedOut?: boolean }): string {
  const captcha = run.destinations.find((d) => d.status === "awaiting_human_captcha");
  if (captcha) {
    const label = PLATFORM_TITLE[captcha.platform] ?? captcha.platform;
    if (options.timedOut) {
      return `Complete the ${label} CAPTCHA in Shark Chrome, then run shark resume ${run.id}.`;
    }
    return `Complete the ${label} CAPTCHA in Shark Chrome.`;
  }
  const login = run.destinations.find((d) => d.status === "awaiting_login");
  if (login) {
    const label = PLATFORM_TITLE[login.platform] ?? login.platform;
    return `Sign in to ${label} in Shark Chrome.`;
  }
  const approval = run.destinations.find(
    (d) => d.status === "awaiting_final_approval" || d.status === "awaiting_approval",
  );
  if (approval) {
    return `Approve the ${PLATFORM_TITLE[approval.platform] ?? approval.platform} publish/send.`;
  }
  const unknown = run.destinations.find((d) => d.status === "unknown_submission_state");
  if (unknown) {
    const label = PLATFORM_TITLE[unknown.platform] ?? unknown.platform;
    return `Verify ${label} manually. Shark will not retry this submission.`;
  }
  const failed = run.destinations.find((d) => d.status === "failed");
  if (failed) {
    const label = PLATFORM_TITLE[failed.platform] ?? failed.platform;
    return `Inspect ${label} in Shark Chrome; no automatic retry will run.`;
  }
  return "No pending action.";
}
