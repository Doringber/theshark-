# 🦈 Shark

Local CLI tool for preparing and cross-posting second-hand product listings to **Facebook Marketplace**, **WhatsApp groups**, and **Yad2**.

> Dry-run is the default. Nothing is ever published without `--publish` **and** explicit approval.

## Sell an item

```bash
npm install && npx playwright install chromium
cp shark.config.example.json shark.config.json
npm run dev -- doctor
npm run dev -- configure --city "תל אביב" --pickup "איסוף עצמי" --platforms facebook,yad2,whatsapp
npm run dev -- sell ~/Desktop/item-photos
npm run dev -- resume <run-id>   # only if interrupted
```

Or pass individual photos:

```bash
npm run dev -- sell --image ./front.jpg --image ./back.jpg --platforms facebook,yad2,whatsapp
```

**CAPTCHA:** Shark never solves, clicks, or bypasses a challenge. It stops, keeps the same Shark Chrome tab open, notifies you, and continues automatically after you complete it. If Shark exits first, run `shark resume <run-id>`.

**Dry-run vs publish:** Dry-run (the default) prepares drafts only. `--publish` unlocks the approval path; it is not approval by itself. Every real Publish or Send still needs a fresh yes.

## One shared, logged-in Chrome window

Shark never opens throwaway browsers. Every command attaches (over CDP, `localhost:9222`) to a
single **Shark Chrome** window with its own persistent profile at `~/.shark/chrome`. You log in to
Facebook, WhatsApp and Yad2 there **once**; from then on every `sell` run reuses those sessions and
just opens a tab. If the window is closed, the next command relaunches it.

```bash
npm run dev -- browser                      # open / focus the window (also: ~/Applications/Shark Chrome.app)
npm run dev -- auth --platform facebook     # open the site's tab for the one-time login
npm run dev -- auth --platform whatsapp
npm run dev -- auth --platform yad2
```

Why not your everyday Chrome? Since Chrome 136 the browser refuses remote debugging on the default
profile, so attaching to it is impossible without relaunching it with debug flags every time.
The shared Shark window gives the same result with a safer boundary. Sign it into your Google
account (Chrome sync) if you want your bookmarks, passwords and extensions in it.

All three adapters are mapped against the **live sites** (Sep 2026). Fixture integration tests
exercise the complete safe workflow. Live readiness checks verify login and known page identity;
they do not Publish or Send.

## Quick Start

```bash
# Prerequisites: Node.js 20+
npm install
npx playwright install chromium

# Copy config
cp shark.config.example.json shark.config.json
cp .env.example .env

# Run in dev mode
npm run dev -- sell --image ./photos/item.jpg
```

## Commands

| Command                                | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| `shark sell [folder\|files] --image …` | Prepare drafts (dry-run by default)              |
| `shark sell … --publish`               | Enable the approval path for final submission    |
| `shark resume <run-id>`                | Continue an interrupted run from its checkpoint  |
| `shark status <run-id>`                | Concise per-platform status and next action      |
| `shark browser [--url <url>]`          | Open / focus the shared Shark Chrome window      |
| `shark auth --platform <name>`         | Open the platform tab in Shark Chrome for login  |
| `shark inspect --platform <name>`      | Save a sanitized DOM snapshot of a platform page |
| `shark doctor`                         | Check Node, browser, config, and credentials     |
| `shark configure`                      | Remember language, city, pickup, platforms       |

### `sell` flags (non-interactive / agent use)

| Flag                                                   | Meaning                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `--title --price --description --condition --location` | Listing facts (skip prompts). Condition: `new,like_new,good,fair,poor`  |
| `--platforms facebook,whatsapp,yad2`                   | Which platforms to run                                                  |
| `--category "Electronics"` `--groups "A,B"`            | Facebook category and groups to cross-post to                           |
| `--wa-to "Chat 1,Group 2"`                             | WhatsApp chats/groups (exact names) — photos + Hebrew caption           |
| `--yad2-type "מחשבים ניידים"` `--yad2-brand Apple`     | Yad2 product type (their category name) and manufacturer                |
| `--draft-only`                                         | Fill the form and leave the tab open for review — never submit          |
| `--publish [--no-dry-run]`                             | Enable final prompts; each destination still needs a fresh approval     |
| `--cdp <url>`                                          | CDP endpoint (default shared Shark Chrome; `none` = legacy own profile) |

Example — real MacBook run used during development:

```bash
npm run dev -- sell --image p1.jpg --image p2.jpg --image p3.jpg \
  --title "מקבוק אייר 2015 13 אינץ'" --price 300 --condition good --location "מודיעין מכבים רעות" \
  --description "עובד מצוין, סוללה במצב טוב. איסוף עצמי." \
  --platforms whatsapp,yad2 --wa-to "+972 50-732-8808" \
  --yad2-type "מחשבים ניידים" --yad2-brand Apple --draft-only
```

## Configuration

`shark.config.json` is git-ignored (it holds your pickup address); start from
`shark.config.example.json`:

```json
{
  "language": "he",
  "dryRun": true,
  "currency": "NIS",
  "seller": { "city": "תל אביב יפו", "street": "דיזנגוף", "houseNumber": "1" },
  "platforms": {
    "facebook": { "enabled": true, "url": "https://www.facebook.com" },
    "whatsapp": { "enabled": true, "url": "https://web.whatsapp.com" },
    "yad2": { "enabled": true, "url": "https://www.yad2.co.il" }
  }
}
```

## Safety Model

Shark enforces strict safety invariants — see [`AGENTS.md`](./AGENTS.md) for the full list.

- **Dry-run by default** — `--publish` enables the approval path but is not authorization by itself
- **Fresh approval per destination** — every submit requires an in-memory token bound to `(runId, listingId, platform, destination)` with a short TTL
- **No credential logging** — passwords, cookies, tokens, and browser storage are never persisted
- **Image safety** — only `approved_for_upload` images are uploaded; `analysis_only` and `replace_required` are excluded
- **Graceful degradation** — missing UI elements return `needs_mapping` instead of crashing
- **No auto-retry** — uncertain submissions return `unknown_submission_state`

## Architecture

```
src/
├── cli.ts                          # Commander entry point
├── domain/
│   ├── schemas.ts                  # Zod schemas: Listing, ProductImage, ProductFact
│   ├── config.ts                   # SharkConfig with URL safety validation
│   └── index.ts                    # Domain exports
├── services/
│   ├── approvals.ts                # In-memory approval tokens (Symbol-branded)
│   ├── run-store.ts                # Local file-based RunRecord persistence
│   └── redaction.ts                # PII/secret sanitization for logs & snapshots
├── browser/
│   ├── session.ts                  # Attaches to the shared Shark Chrome (CDP); launches it if needed
│   ├── safe-navigation.ts          # Host-validated navigation with redirect blocking
│   ├── login-detector.ts           # Visibility-based login state detection
│   └── snapshot.ts                 # Sanitized accessibility tree capture
└── platforms/
    ├── platform-adapter.ts         # PlatformAdapter interface + BasePlatformAdapter
    ├── facebook-marketplace.ts     # Facebook Marketplace adapter
    ├── whatsapp-web.ts             # WhatsApp Web adapter (groups + per-group approval)
    └── yad2.ts                     # Yad2 adapter (Hebrew form filling)
```

## Platform Adapters

Each adapter implements the `PlatformAdapter` interface:

| Method                        | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `verifyLogin(page)`           | Detect `logged_in`, `login_required`, or `unknown`    |
| `prepareDraft(page, listing)` | Navigate and fill the form (no submit)                |
| `preview(page)`               | Read back filled values for user confirmation         |
| `submit(page, approval)`      | Click publish/send — only with a valid approval token |

### Facebook Marketplace (live)

`/marketplace/create/item` → photos, title, price, category (dialog), condition, description →
Next → destination step: Marketplace + selected groups, Boost off → Publish → success when the URL
moves to `/marketplace/you` or "listing is live" appears.

### WhatsApp Web (live)

Reuses the single WhatsApp tab (WhatsApp allows one). Sidebar search `#side input[role=textbox]` →
`#pane-side span[title="<exact name>"]` → Attach → "Photos & videos" (file chooser) → caption
(Shift+Enter for line breaks) → `Send`. Every chat is verified to exist before anything is sent.

### Yad2 (live)

`/publish-ad-products/create` (stable `data-testid`s). "Resume draft?" is always answered with
"התחלה מחדש". Photos → title → product type (autocomplete) → manufacturer (menu) → description →
condition toggle → price → contact modal: city / street / house number (all pick-from-list) →
terms checkbox. `--draft-only` stops there; otherwise `סיום והעלאה`. An hCaptcha ("Are you for real?")
pauses the run at `awaiting_human_captcha`. Shark waits in the same tab; it never clicks the
checkbox or retries Publish automatically.

## Claude Code plugin

The repo doubles as a Claude Code plugin (`.claude-plugin/plugin.json`): the `shark-sell` skill
carries the operating rules and site knowledge, and `/shark-sell`, `/shark-browser` are slash
commands. Install from a local clone:

```
/plugin marketplace add /path/to/theshark-
/plugin install shark
```

## Development

```bash
npm run build          # TypeScript compile
npm run dev            # Run via tsx (no build needed)
npm run format         # Prettier write
npm run format:check   # Prettier check
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests
npm run test:watch     # Vitest watch mode
npm run test:integration  # Playwright integration tests
```

### Test Suite

The release gate runs the complete Vitest suite plus 66 Playwright fixture tests covering browser
foundations, Facebook, WhatsApp, Yad2, CAPTCHA interruption, resume, and duplicate prevention.
GitHub Actions runs format, lint, typecheck, build, unit, and integration checks for every PR and
push to `main`.

Integration tests run against local HTML fixtures served on `localhost:4173` — no real platform interaction.

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript 6
- **CLI:** Commander
- **Validation:** Zod 4
- **Browser:** Playwright over CDP → shared Google Chrome window (`~/.shark/chrome`)
- **Testing:** Vitest + Playwright Test
- **Linting:** ESLint + typescript-eslint + Prettier
