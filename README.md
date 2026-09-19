# 🦈 Shark

Local CLI tool for preparing and cross-posting second-hand product listings to **Facebook Marketplace**, **WhatsApp groups**, and **Yad2**.

> **Phase 1** — Dry-run is the default. Nothing is ever published without `--publish` **and** explicit interactive approval.

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

| Command                                   | Description                                         |
| ----------------------------------------- | --------------------------------------------------- |
| `shark sell --image <paths...>`           | Run the interactive sale flow (dry-run by default)  |
| `shark sell --image <paths...> --publish` | Enable the approval path for final submission       |
| `shark auth --platform <name>`            | Open a platform and log in manually                 |
| `shark inspect --platform <name>`         | Save a sanitized DOM snapshot of a platform page    |
| `shark doctor`                            | Check Node, browser, config, and credentials        |
| `shark configure`                         | Save platform URLs, language, city, browser profile |

## Configuration

Edit `shark.config.json`:

```json
{
  "language": "he",
  "dryRun": true,
  "currency": "NIS",
  "browserProfilePath": "~/.shark/browser-profile",
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
│   ├── session.ts                  # Playwright persistent-profile session
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

### Facebook Marketplace

Home → Marketplace → Create new listing → Item for sale → fill title/price/description/photos → Next → select destinations → Publish

### WhatsApp Web

Groups filter → collect group names → identify sale groups (Hebrew keywords) → open group → attach photos + compose message → per-group approval → Send

### Yad2

Home → מוצרים → פרטי (never מנוי עסקי) → fill כותרת/מחיר/תיאור/עיר/תמונות → פרסום

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

| Suite              | Tests   | Framework  | Scope                                                |
| ------------------ | ------- | ---------- | ---------------------------------------------------- |
| image-validation   | 24      | Vitest     | Image path/type/upload-state validation              |
| listing-schemas    | 14      | Vitest     | Listing Zod schema enforcement                       |
| url-safety         | 22      | Vitest     | HTTPS-only, host allowlisting, credential rejection  |
| config             | 16      | Vitest     | Configuration loading and defaults                   |
| approvals          | 12      | Vitest     | Token creation, expiry, platform/destination binding |
| run-store          | 20      | Vitest     | Run persistence, status transitions, cancellation    |
| redaction          | 23      | Vitest     | PII, secrets, tokens, URLs sanitization              |
| safe-navigation    | 4       | Vitest     | Host validation for navigation                       |
| platform-adapter   | 4       | Vitest     | Adapter contract and BasePlatformAdapter stubs       |
| browser-foundation | 21      | Playwright | Login detection, navigation, snapshots on fixtures   |
| facebook-adapter   | 12      | Playwright | Full Marketplace flow on fixtures                    |
| whatsapp-adapter   | 11      | Playwright | Group management + per-group approval on fixtures    |
| yad2-adapter       | 11      | Playwright | Hebrew form flow on fixtures                         |
| **Total**          | **194** |            |                                                      |

Integration tests run against local HTML fixtures served on `localhost:4173` — no real platform interaction.

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript 6
- **CLI:** Commander
- **Validation:** Zod 4
- **Browser:** Playwright (Chromium, persistent profiles)
- **Testing:** Vitest + Playwright Test
- **Linting:** ESLint + typescript-eslint + Prettier
