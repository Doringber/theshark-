---
name: shark-goal
description: Pursue a selling objective to completion with /goal durability—draft copy, shared Shark Chrome login once, fill marketplace forms for review, and show the user the live browser. Use with /goal or when the user wants end-to-end listing prep with real browser work.
---

# Shark goal workflow

Combines Cursor **Goal** persistence with the Shark CLI browser profile. Cookies and sessions live in `~/.shark/chrome` (Chrome user data). Never export, log, or paste cookies or tokens into chat.

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

6. **Fill forms (dry-run default)** after the user approves the draft copy:

   ```bash
   npm run shark -- fill --platform facebook \
     --title "..." --price ... --condition good --location "..." --details "..."
   ```

   Bring the Chrome window to the front, summarize CLI JSON (`form_filled`, `login_required`, `needs_mapping`), and point the user at the open tab. Never click Publish, Post, or Send unless the user included `--publish` in the original request **and** gives fresh approval for that exact destination and text immediately before the click.

7. Repeat steps 5–6 for each destination. Report actual state per destination (draft only, form filled, awaiting approval, unknown).

## Goal completion

Before `UpdateGoal` with status `complete`, verify every deliverable in the objective: draft shown, browser opened, login reused or completed, forms filled or `needs_mapping` explained with tab left open, user shown the result. Unchecked items mean the goal stays active.

## Safety

Same rules as `shark-sell`: no invented product facts, no photo upload unless the user explicitly approved paths, no private WhatsApp history, no persisted publish approvals, no serial numbers from images.
