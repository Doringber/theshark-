/** Required per-platform workflow states for a sell run. */
export const WORKFLOW_STATUSES = [
  "preparing",
  "awaiting_login",
  "awaiting_human_captcha",
  "filling_form",
  "draft_ready",
  "awaiting_final_approval",
  "submitted",
  "unknown_submission_state",
  "skipped",
  "failed",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Allowed status transitions — terminal states have no outgoing edges. */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  preparing: [
    "awaiting_login",
    "awaiting_human_captcha",
    "filling_form",
    "draft_ready",
    "skipped",
    "failed",
  ],
  awaiting_login: ["filling_form", "awaiting_human_captcha", "skipped", "failed"],
  awaiting_human_captcha: [
    "filling_form",
    "awaiting_login",
    "draft_ready",
    "skipped",
    "failed",
  ],
  filling_form: [
    "awaiting_human_captcha",
    "draft_ready",
    "awaiting_login",
    "skipped",
    "failed",
  ],
  draft_ready: ["awaiting_final_approval", "skipped", "failed"],
  awaiting_final_approval: [
    "submitted",
    "skipped",
    "failed",
    "unknown_submission_state",
  ],
  submitted: [],
  unknown_submission_state: [],
  skipped: [],
  failed: [],
};

const TERMINAL: ReadonlySet<WorkflowStatus> = new Set([
  "submitted",
  "unknown_submission_state",
  "skipped",
  "failed",
]);

const RETRY_FORBIDDEN: ReadonlySet<WorkflowStatus> = new Set([
  "submitted",
  "unknown_submission_state",
]);

export function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: WorkflowStatus): boolean {
  return TERMINAL.has(status);
}

export function isRetryForbidden(status: WorkflowStatus): boolean {
  return RETRY_FORBIDDEN.has(status);
}
