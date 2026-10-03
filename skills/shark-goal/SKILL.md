---
name: shark-goal
description: Pursue a selling objective to completion with /goal durability—draft copy, shared Shark Chrome login once, fill marketplace forms for review, and show the user the live browser. Use with /goal or when the user wants end-to-end listing prep with real browser work.
---

# Shark goal workflow

Follow [shark-sell](../shark-sell/SKILL.md) for backend selection, authentication, photos, live verification, and final-action approval. In ChatGPT Work, use the hosted browser directly; do not launch local Chrome or request a CDP URL. Use the steps below only with local Shark Chrome.

Use Cursor Goal persistence only when its goal skill and CreateGoal/UpdateGoal tools are available. Otherwise pursue the objective in the current conversation without inventing those tools. Cookies and sessions for the local backend live in `~/.shark/chrome`. Never export, log, or paste cookies or tokens into chat.

## When the user sends `/goal …` for selling

1. Follow the Cursor **goal** skill: restate the objective, call `CreateGoal` once, then do real work immediately—do not stop at a plan.
2. Gather typed facts (title, price, condition, location, details, destinations, approved photos). Use only those facts in copy.
3. Validate and show draft text:

   ```bash
   npm run shark -- draft --title "..." --price ... --condition good --location "..." --details "..."
   ```

4. **Browser session (one-time login per site):**

   ```bash
   npm run shark -- browser
   npm run shark -- auth --platform facebook   # or yad2, whatsapp
   ```

   Tell the user to log in manually in the Shark Chrome window. Wait for them if needed. Reuse the same profile on later runs—do not ask for passwords.

5. **Verify session before filling:**

   ```bash
   npm run shark -- check --platform facebook
   ```

   If `state` is `login_required`, go back to step 4. If `checkpoint` is set, stop for CAPTCHA/2FA and let the user finish in the browser.

6. **Fill forms (dry-run default)** after the user approves the draft copy — once per destination:

   ```bash
   npm run shark -- fill --platform facebook --title "..." --price ... --condition good --location "..." --details "..."
   npm run shark -- fill --platform whatsapp --wa-to "Exact chat or group name" --title "..." --price ... --condition good --details "..."
   npm run shark -- fill --platform yad2 --title "..." --price ... --condition good --location "..." --details "..."
   ```

   Bring Chrome to the front, summarize CLI JSON (`form_filled`, `session_ready`, `compose_ready`, `login_required`, `needs_mapping`), and point the user at the open tab. Never click Publish, Post, or Send unless the user included `--publish` in the original request **and** gives fresh approval for that exact destination and text immediately before the click.

7. Repeat steps 5–6 for Facebook, WhatsApp (with explicit `--wa-to`), and Yad2 as requested. Report actual state per destination.

## Goal completion

Before `UpdateGoal` with status `complete`, verify every deliverable in the objective: draft shown, browser opened, login reused or completed, forms and photos verified, or each blocker explained with the actual partial state and tab preserved, user shown the result. Unchecked items mean the goal stays active.

## Safety

Same rules as `shark-sell`: no invented product facts, no photo upload unless the user explicitly approved paths, no private WhatsApp history, no persisted publish approvals, no serial numbers from images.
