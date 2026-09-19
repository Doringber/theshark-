# Shark engineering invariants

## Safety

- Dry-run is the default. No command may publish or send unless `--publish` is present and a fresh interactive approval is granted immediately before the final action.
- `--publish` enables the approval path; it is not authorization by itself.
- Every submit operation requires a fresh in-memory approval bound to run ID, listing ID, platform, exact destination, and expiry time. Approvals are never persisted, reused, or shared between destinations.
- If a final click may have happened but success is uncertain, return `unknown_submission_state` and never retry automatically.
- Never bypass login, QR authentication, CAPTCHA, 2FA, security checkpoints, rate limits, or platform restrictions.
- Never log or persist passwords, cookies, tokens, browser storage, private message history, request headers, or image bytes.
- Never reproduce a serial number, IMEI, ID number, account name, or other sensitive identifier found in an image in generated copy, logs, snapshots, or provider prompts.
- Never upload an image marked `analysis_only` or `replace_required`. Upload only the exact ordered image set the user has approved; do not silently enhance, crop, replace, or add images.

## Browser automation

- Never fabricate, guess, or hallucinate live selectors.
- Prefer accessible role, label, and visible text; keep selectors isolated inside platform adapters.
- When the real page does not match verified selectors, return `needs_mapping`, keep the browser available for inspection, and stop safely.
- Fixture selectors are not proof that Facebook, WhatsApp, or Yad2 live selectors work.
- Never run automated live publishing tests.
- Before Playwright planning, implementation, debugging, review, or determinism analysis, read `.agents/skills/playwright-e2e/SKILL.md` and its relevant references.
- Qualiow Playwright guidance supplements these invariants. If generated guidance conflicts with Shark safety, privacy, approvals, fixture-only scope, or dry-run behavior, `AGENTS.md` wins.

## Development process

- Tests are the contract. Write or update the relevant safety tests before implementing behavior, observe the expected failure, then implement the smallest correct change.
- Never delete, skip, weaken, or rewrite a safety test merely to make the implementation pass.
- Work only on the current approved slice. Do not pre-build later slices.
- Preserve existing working behavior and unrelated user changes.
- Before claiming a slice is complete, run formatting check, lint, TypeScript typecheck, and all tests required by that slice. Report exact commands and results.
- Do not push, publish, deploy, commit, or perform a real external submission unless the user explicitly requests it.
