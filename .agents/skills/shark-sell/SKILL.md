---
name: shark-sell
description: Prepare safe second-hand listing previews with Shark for Facebook Marketplace, WhatsApp, and Yad2. Use when the user wants help selling or cross-posting an item; never assume permission to publish or send.
---

# Shark Sell

Use the Shark CLI from this repository to prepare a second-hand listing. The user can invoke this skill with `$shark-sell` and provide item photos, facts, and desired destinations.

## Safety rules

- Start with a dry-run preview. A request to “sell” or “post” does not authorize a real post or message.
- Never add `--publish` or `--no-dry-run` unless the user explicitly asks to publish or send.
- Before filling a live form or uploading photos with `--draft-only`, show the exact listing, destinations, and ordered photo paths, then get the user's explicit approval for that exact set. If approval is missing, stop at the dry-run preview.
- Real submission requires a fresh interactive approval in Shark's terminal immediately before each final action. Chat approval is not a substitute. If no interactive terminal is available, fail closed.
- Treat Facebook Marketplace, each Facebook group, each WhatsApp chat, and Yad2 as separate destinations. Confirm exact group/chat names and destination-specific details before acting.
- Use only user-typed facts. Ask about missing title, price, condition, location, description, platform, or destination; never infer or invent them.
- Never inspect image bytes to infer product facts. Use only the exact ordered image set the user approved. Exclude photos the user marks `analysis_only` or `replace_required`; never silently crop, enhance, replace, or add photos.
- Do not send image bytes or paths to an LLM. Do not reproduce serial numbers, IMEIs, ID numbers, account names, or other sensitive identifiers found in photos.
- Never bypass login, QR authentication, CAPTCHA, 2FA, security checks, rate limits, or platform restrictions. Ask the user to handle a checkpoint in Shark Chrome and wait for direction before resuming.
- If a final click may have happened but success is uncertain, report `unknown_submission_state` and do not retry automatically.

## Workflow

1. Collect the item facts, exact ordered photo paths, chosen platforms, and exact destinations. For WhatsApp, require exact chat names. For Facebook groups, require exact group names. For Yad2, use the exact product type the user provides or confirms.
2. If needed, run `npm run dev -- doctor` from the repository root. Do not expose credentials or sensitive environment values in output.
3. Build and run a preview command without `--publish`, `--no-dry-run`, or `--draft-only`. Dry-run is the default. If facts are supplied as flags, use `--non-interactive` only to skip the interview; it does not grant approval.
4. Show the user the complete listing and one line per exact destination. Ask whether they want only the preview, a draft-only form fill, or a real submission.
5. For a draft-only form fill, obtain approval for the exact text, destination list, and ordered photos, then run with `--draft-only` and without `--publish`. Leave the page open for the user's review; never click the final submit/send control.
6. For a real post or message, proceed only after the user explicitly requests it. Use `--publish`; add `--no-dry-run` only if Shark's config is forcing dry-run and the user has explicitly authorized the real action. Keep Shark's fresh interactive approval prompt enabled for every exact destination.
7. Report the run ID and per-destination status exactly. Do not describe `unknown_submission_state`, `needs_mapping`, CAPTCHA, login, or other unresolved states as success. Check `shark status <run-id>` only when useful; never resume automatically.

## Command shape

Run from the Shark repository root. Use user-provided paths and values; do not substitute sample listing facts.

```bash
npm run dev -- sell --image "/path/to/photo-1.jpg" --image "/path/to/photo-2.jpg" \
  --title "<user-provided title>" --price <user-provided-price> \
  --condition <new|like_new|good|fair|poor> --location "<user-provided area>" \
  --description "<user-provided description>" --platforms <facebook,whatsapp,yad2>
```

Add only the destination-specific flags needed and confirmed by the user:

- Facebook: `--category "<category>"`, `--groups "<exact group names>"`
- WhatsApp: `--wa-to "<exact chat names>"`
- Yad2: `--yad2-type "<exact product type>"`, `--yad2-brand "<brand>"`

Do not use `--llm` unless the user asks for copywriting. If requested, use only user-typed facts and an API key already supplied through the environment; never ask for or print a key.
