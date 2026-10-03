---
name: shark-sell
description: Prepare second-hand listings and fill Facebook Marketplace, Yad2, or a chosen WhatsApp chat using the assistant's browser in ChatGPT Work or the existing Shark Chrome CLI in local assistants. Use when the user asks Shark to sell an item or prepare marketplace ads. Publishing and sending require fresh approval.
---

# Shark listing workflow

Take seller-provided facts to reviewed listing drafts in three platforms. Choose a browser backend before starting. Do not require Node.js or CDP for the assistant's hosted browser. Report only states supported by current evidence.

## Choose the available backend

- **Hosted assistant (ChatGPT Work):** use its advertised browser tools directly. Follow their startup, authentication, upload, handoff, and confirmation documentation. Keep browser handles in that runtime; do not connect the Node CLI to this browser, request a hidden CDP URL, export sessions, or launch a replacement local browser. A GitHub login does not authenticate Facebook, WhatsApp, or Yad2.
- **Local assistant (Codex, Claude Code, Cursor):** when the repo, Node, Chrome, and local execution are available, use the existing CLI and persistent Shark Chrome profile. An explicitly provided reachable CDP endpoint is also supported. If this path is unavailable and the host provides browser controls, use those controls instead.
- **No usable browser:** prepare the listing text and identify the missing capability. Do not claim live forms are filled.

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
4. Execute the matching backend below for each requested destination. Use the same reviewed facts, text, and approved images. Handle each site's login separately. If one platform is blocked, preserve its state and continue independently authorized work on the others.
5. Default to dry-run. Stop before Publish, Post, Send, or any equivalent final action. Submitting requires `--publish` in the user's request and a fresh interactive approval immediately before each final action. Bind that in-memory approval to the run ID, listing ID, platform, exact destination, and expiry. Show the exact listing text and ordered image set in the approval prompt. `--publish` alone is not approval. Never persist, reuse, or share an approval across destinations.
6. Complete authentication through the host's secure authentication capability or its documented manual handoff; with local Shark Chrome, let the user log in in that window. Never request credentials in chat. Follow the host's rules for CAPTCHA and 2FA. Do not treat a generic 403 as proven bot detection or bypass a site restriction. If a final action has an unclear outcome, report `unknown_submission_state` and do not retry.
7. Report backend, destination, actual state, fields verified, missing fields/photos, and any blocker for each platform. Distinguish `draft_prepared`, `login_required`, `partial_fill`, `form_filled`, `compose_ready`, `blocked`, `awaiting_approval`, `confirmed_submitted`, and `unknown_submission_state`. A CLI success string alone is not proof that every requested field was filled.

## Hosted browser workflow

1. Open or reuse the site's tab through the host's documented browser API. Start at Facebook Marketplace's create-item page, WhatsApp Web, or Yad2's product-listing flow. Derive later navigation from the live page. Do not reuse cookies from another backend.
2. Inspect the rendered page, then resolve login or device linking through the secure host capability. After authentication, verify a visible signed-in signal before editing. If blocked, report the observed error and continue other platforms; do not retry in a loop or invent selectors.
3. **Facebook:** locate the current title, price, condition, category, description, location, and image controls using visible labels/roles or observed DOM. Support Hebrew or English UI. Ask for any missing required product facts; do not choose a category or location suggestion without evidence that it matches. Fill only approved values. Do not click Publish or a final group-post action.
4. **WhatsApp:** require the exact named chat/group or status audience. Search only for that destination without reading message history. If multiple chats share the name, ask the user to identify the intended one. Confirm the opened destination from its visible header, then put the reviewed message in the composer. Stop before Send. Attach approved images only through the documented upload flow; do not overwrite an existing unrelated draft without the user's direction.
5. **Yad2:** follow the visible category and product steps, gathering required facts rather than guessing. Fill title, description, price, condition, pickup information, and approved photos wherever supported. Preserve an existing unrelated draft; do not click 'start over' automatically. Stop before the final Publish/Post action or a paid placement.
6. Read back the relevant field values or preview and verify the ordered images. Report `partial_fill` when any requested field cannot be entered or verified. Keep the tab available through the host's documented deliverable/handoff mechanism, and show a suitable screenshot without private WhatsApp history or account details.

## Existing CLI workflow

Run `npm run shark -- browser`, then `auth --platform …`, and `check --platform …`. Complete login in Shark Chrome. Use `fill --platform …` with the reviewed fact flags; use `--wa-to` for WhatsApp. Reuse `~/.shark/chrome` or the same explicitly selected CDP endpoint for all commands.

The current CLI fills a subset of marketplace fields and has no photo-upload option. Report those gaps. When host browser controls can access the same browser, inspect the actual result and complete approved missing fields there; otherwise leave those fields for manual completion. Never assume hosted and local browsers share a session.

## Safety and privacy

- Use only user-typed facts for generated copy. Never send image bytes or image paths to an LLM provider. Never reproduce serial numbers, IMEIs, identity numbers, account names, or other sensitive identifiers from images or page content.
- Upload only the exact ordered images the user approved. Never upload images marked `analysis_only` or `replace_required`; do not enhance, crop, replace, or add images silently.
- Never log or persist passwords, cookies, tokens, browser storage, private messages, request headers, or image bytes. Never bypass authentication, platform restrictions, rate limits, or security checks.
- Never read private message history or submit messages to an unspecified audience.
- Do not publish or send without the explicit `--publish` path and fresh, destination-bound approval described above. The CLI remains draft-only; `--publish` is an instruction to the skill, not a CLI option.
