---
name: shark-sell
description: Prepare and, when browser controls are available, fill second-hand listings on Facebook Marketplace, Yad2, or an explicitly chosen WhatsApp destination from seller-provided facts. Use for selling an item; publishing and messaging require fresh approval.
---

# Shark listing workflow

Take a listing from item facts to platform forms. The CLI formats draft text; browser work uses the host assistant's available UI controls. Do not claim a form was filled or submitted unless the live page confirms it.

## Workflow

1. Gather typed facts: item title, price, condition, pickup area, details or defects, the exact platform destinations, and the ordered photo set (if any). Ask for missing required facts. Never infer product claims from photos or other account content.
2. Draft concise copy in the user's language. Keep every claim within the facts the user supplied. Use the repo CLI, when available, to format and validate the draft:

   ```bash
   npm run shark -- draft \
     --title "Oak desk" \
     --price 120 \
     --condition good \
     --location "Haifa" \
     --details "Solid wood; small scratch on top"
   ```

3. Show the copy and ask the user to correct it before touching marketplace forms.
4. For each requested destination, use the host's available browser UI and inspect the live page. Work only from verified labels and visible content; do not guess selectors. Fill the form with approved facts and images. If the page differs from the verified UI or a control is unclear, report `needs_mapping`, leave the browser available for inspection, and stop. If browser control is unavailable, leave a ready-to-copy draft and say why the form could not be filled.
5. Default to dry-run. Stop before Publish, Post, Send, or any equivalent final action. Submitting requires `--publish` in the user's request and a fresh interactive approval immediately before each final action. Bind that in-memory approval to the run ID, listing ID, platform, exact destination, and expiry. Show the exact listing text and ordered image set in the approval prompt. `--publish` alone is not approval. Never persist, reuse, or share an approval across destinations.
6. If a login, QR code, CAPTCHA, 2FA, security check, or unclear destination appears, stop and let the user take over. For WhatsApp, require the user to name the exact group, chat, or status audience; never inspect private message history. If it is unclear whether a final action succeeded, report `unknown_submission_state` and do not retry.
7. Report each destination's actual state: draft prepared, form filled, awaiting approval, confirmed submitted, or unknown submission state. Do not imply that a draft or form is a published listing.

## Safety and privacy

- Use only user-typed facts for generated copy. Never send image bytes or image paths to an LLM provider. Never reproduce serial numbers, IMEIs, identity numbers, account names, or other sensitive identifiers from images or page content.
- Upload only the exact ordered images the user approved. Never upload images marked `analysis_only` or `replace_required`; do not enhance, crop, replace, or add images silently.
- Never log or persist passwords, cookies, tokens, browser storage, private messages, request headers, or image bytes. Never bypass authentication, platform restrictions, rate limits, or security checks.
- Never read private message history or submit messages to an unspecified audience.
- Do not publish or send without the explicit `--publish` path and fresh, destination-bound approval described above. The CLI remains draft-only; `--publish` is an instruction to the skill, not a CLI option.
