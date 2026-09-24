---
name: shark-sell
description: Use when the user wants to sell / post / publish a second-hand item (מכירה, למכירה, פרסום מודעה) to Facebook Marketplace, Facebook groups, WhatsApp chats or Yad2, or asks to open/login the Shark browser. Drives the Shark CLI against one shared logged-in Chrome window.
---

# Shark — sell an item across Facebook, WhatsApp and Yad2

Shark is a local CLI (`npm run dev -- <command>` from the repo root) that fills real
listing forms in **one shared Chrome window** (`~/.shark/chrome`, CDP on
`127.0.0.1:9333`). The user logs in to each site there once; every command reuses it.
Chrome forbids attaching to a user's main profile, so this window is the only one Shark
ever drives. Never launch other browsers.

## Non-negotiables

- **Dry-run is the default.** Real submission needs `--publish` (and `--no-dry-run` if
  `shark.config.json` has `dryRun: true`). Every destination still requires a fresh
  interactive approval immediately before Publish or Send.
- **One approval per destination.** Marketplace, each Facebook group, each WhatsApp
  chat and Yad2 are separate destinations. Name them back to the user before publishing.
- **Never invent product facts.** Title, price, condition, description, location come
  from the user. Ask if missing; do not guess a price.
- **Never bypass captchas or logins.** If Yad2 shows "Are you for real?" or a site asks
  to log in, tell the user to complete it in the Shark Chrome tab. Shark never clicks
  a CAPTCHA. It waits on the same tab and continues automatically. If the process
  already exited, run `shark resume <run-id>`.
- **Selectors are mapped from the live DOM.** If a run returns `needs_mapping`, do not
  guess a fix — run `inspect` and read the snapshot in `.shark/snapshots/`.

## Workflow

1. **Collect facts**: images (paths), title, price (₪), condition
   (`new|like_new|good|fair|poor`), location, description, target platforms and, per
   platform, destinations (FB group names, WhatsApp chat names, Yad2 type/brand).
2. **Preview (dry-run)** — always first:
   ```bash
   npm run dev -- sell ~/Desktop/item-photos --platforms facebook,yad2,whatsapp
   npm run dev -- sell --image a.jpg --image b.jpg \
     --title "..." --price 300 --condition good --location "תל אביב" \
     --description "..." --platforms facebook,whatsapp,yad2 --non-interactive
   ```
   `--non-interactive` skips the fact interview (every fact must be a flag — Shark refuses to
   guess). It never answers a Publish/Send prompt; those stay with the user in the terminal.
3. **Show the user the plan** (one line per destination) and get an explicit yes.
4. **Publish** with the same flags plus `--publish` (and `--no-dry-run` when config
   forces dry-run). Approve each destination at its final prompt. Platform specifics:

   | Platform | Flags                                                             | Notes                                                                                                                          |
   | -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
   | facebook | `--category "Electronics"` `--groups "Group A,Group B"`           | Marketplace listing; groups are selected on the destination step; Boost is turned off.                                         |
   | whatsapp | `--wa-to "Chat 1,Group 2"` (exact names as shown in WhatsApp)     | Sends photos + Hebrew caption to each chat. WhatsApp allows one tab — Shark reuses it.                                         |
   | yad2     | `--yad2-type "מחשבים ניידים"` `--yad2-brand Apple` `--draft-only` | Type is Yad2's own category name. Prefer `--draft-only`: fills everything, leaves the tab for the user to press "סיום והעלאה". |

5. **Report** the summary block (run id, per-destination status). `draft_ready`,
   `submitted`, `awaiting_human_captcha`, `skipped`, `needs_mapping`, and
   `unknown_submission_state` mean exactly that — do not upgrade an uncertain state
   to success. Use `shark status <run-id>` and `shark resume <run-id>` after a pause.

## Setup / recovery commands

```bash
npm run dev -- browser                    # open or focus the shared Shark Chrome
npm run dev -- browser --url https://...  # open a page in it
npm run dev -- auth --platform yad2       # open the site's tab for a one-time login
npm run dev -- inspect --platform yad2    # save a sanitized DOM snapshot for mapping
npm run dev -- doctor                     # environment check
```

Seller pickup address for Yad2 lives in `shark.config.json` →
`seller.city / seller.street / seller.houseNumber` (git-ignored; copy from
`shark.config.example.json`). Yad2 publishes only the city.

## Known site behaviours (mapped Sep 2026)

- **Facebook**: form at `/marketplace/create/item`; multi-step Next → destinations →
  Publish; success = URL moves to `/marketplace/you` or "listing is live" text.
- **WhatsApp**: sidebar search is `#side input[role=textbox]`; results are
  `#pane-side span[title="<exact name>"]`; attach via the "Photos & videos" menu item and
  a file chooser; send button `[role=button][aria-label^="Send"]`.
- **Yad2**: form at `/publish-ad-products/create`, stable `data-testid`s
  (`text-field-title`, `text-field-type`, `text-field-manufacture`, `text-area`,
  `toggle-button-input`, `price-input`, `edit-button`, `checkbox-input`). Type, city,
  street and house number are all pick-from-list autocompletes. A first-time
  "resume draft?" modal is answered with "התחלה מחדש"; a CAPTCHA resume never
  clicks that button. Rapid reloads trigger hCaptcha — slow down.
