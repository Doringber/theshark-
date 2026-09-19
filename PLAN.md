# Shark — Phase 1 Implementation Plan

## Slices

| Slice | Scope                                                                  | Status      | Exit Gate                                           |
| ----- | ---------------------------------------------------------------------- | ----------- | --------------------------------------------------- |
| 1     | Scaffold, Qualiow Playwright skill, schemas, configuration, URL safety | ✅ Complete | All gates passed                                    |
| 2     | Approval tokens, run store, redaction                                  | ✅ Complete | All gates passed                                    |
| 3     | Browser session, adapter contract, fixture pages                       | ✅ Complete | All gates passed                                    |
| 4     | Facebook, WhatsApp, and Yad2 fixture adapters                          | ✅ Complete | Each adapter suite passes separately, then together |
| 5     | `sell` orchestration, CLI completion, documentation                    | ⏳ Pending  | Full build, all tests, and fixture dry-run pass     |

---

## Slice 3 — Browser Session, Adapter Contract, Fixtures

### Status: ✅ Complete

### Scope

- Playwright Chromium session with configurable persistent profile
- Browser profile lock detection (SingletonLock)
- Safe navigation with allowed-host enforcement and redirect blocking
- Login detection using visible-element checks (login_required, logged_in, unknown)
- Security checkpoint detection (CAPTCHA, 2FA)
- PlatformAdapter interface contract (verifyLogin, prepareDraft, preview, submit)
- BasePlatformAdapter stub returning needs_mapping
- Sanitized page snapshot (accessibility tree, no cookies/storage/headers/query params)
- Local fixture pages: Facebook (4 pages), WhatsApp (1 page with groups), Yad2 (3 pages)
- All fixtures use accessible roles, labels, and visible text

### Exit Gate Results

```
format:check       — ✅ All files formatted correctly
lint               — ✅ No errors, 0 warnings
typecheck          — ✅ TypeScript compilation completed
unit tests         — ✅ 139 tests passed, 0 failed (292ms)
integration tests  — ✅ 21 tests passed, 0 failed (5.4s)
build              — ✅ TypeScript compilation completed
```

### Test Coverage

| Test Suite         | Tests   | Type        | Status |
| ------------------ | ------- | ----------- | ------ |
| image-validation   | 24      | unit        | ✅     |
| listing-schemas    | 14      | unit        | ✅     |
| url-safety         | 22      | unit        | ✅     |
| config             | 16      | unit        | ✅     |
| approvals          | 12      | unit        | ✅     |
| run-store          | 20      | unit        | ✅     |
| redaction          | 23      | unit        | ✅     |
| safe-navigation    | 4       | unit        | ✅     |
| platform-adapter   | 4       | unit        | ✅     |
| browser-foundation | 21      | integration | ✅     |
| **Total**          | **160** |             | ✅     |

### New Files (Slice 3)

Source:

- `src/browser/session.ts` — Playwright persistent-profile session with lock detection
- `src/browser/safe-navigation.ts` — Host-validated navigation with redirect blocking
- `src/browser/login-detector.ts` — Visibility-based login state detection
- `src/browser/snapshot.ts` — Sanitized accessibility tree capture
- `src/platforms/platform-adapter.ts` — PlatformAdapter interface + BasePlatformAdapter stub

Fixtures:

- `tests/fixtures/pages/facebook/{index,marketplace,create-listing,item-for-sale}.html`
- `tests/fixtures/pages/whatsapp/index.html`
- `tests/fixtures/pages/yad2/{index,products,product-form}.html`
- `tests/fixtures/pages/serve.json` — Serve config (cleanUrls disabled)

Tests:

- `tests/unit/safe-navigation.test.ts` — 4 host validation tests
- `tests/unit/platform-adapter.test.ts` — 4 adapter contract tests
- `tests/integration/browser-foundation.test.ts` — 21 integration tests (login detection, safe navigation, snapshots, fixture structure)

### Remaining Work (Slice 5)

- `sell` command orchestration tying adapters together
- CLI completion for all commands
- Documentation

## Slice 4 — Three Platform Adapters Against Fixtures

### Status: ✅ Complete

### Scope

- FacebookMarketplaceAdapter: full navigation (Home → Marketplace → Create → Item for sale), form filling (title, price, description, location, photos), destination selection, publish with approval
- WhatsAppWebAdapter: group collection, sale-group identification via Hebrew keywords, per-group message preparation with attachments, per-group approval, send
- Yad2Adapter: navigation (Home → Products → Private), Hebrew form filling (כותרת, מחיר, תיאור, עיר), photo upload, publish with approval
- All adapters: empty-upload-set rejection, analysis_only rejection, replace_required exclusion, needs_mapping on missing elements, null-approval rejection, wrong-platform rejection

### Exit Gate Results

```
prettier           — ✅ All files formatted correctly
lint               — ✅ No errors, 0 warnings
typecheck          — ✅ TypeScript compilation completed
unit tests         — ✅ All unit tests pass
integration tests  — ✅ 55 tests passed (3x combined runs: 34/34 each)
build              — ✅ TypeScript compilation completed
```

### Test Coverage (Adapter Tests)

| Test Suite        | Tests  | Type        | Status |
| ----------------- | ------ | ----------- | ------ |
| facebook-adapter  | 12     | integration | ✅     |
| whatsapp-adapter  | 11     | integration | ✅     |
| yad2-adapter      | 11     | integration | ✅     |
| **Adapter Total** | **34** | integration | ✅     |

### New Files (Slice 4)

Source:

- `src/platforms/facebook-marketplace.ts` — Full Facebook Marketplace adapter
- `src/platforms/whatsapp-web.ts` — WhatsApp Web adapter with group management
- `src/platforms/yad2.ts` — Yad2 adapter with Hebrew form filling

Tests:

- `tests/integration/facebook-adapter.test.ts` — 12 tests (navigation, form fill, images, preview, dry-run, publish, approval safety)
- `tests/integration/whatsapp-adapter.test.ts` — 11 tests (login, groups, sale detection, messages, per-group approval, dry-run)
- `tests/integration/yad2-adapter.test.ts` — 11 tests (navigation, form fill, images, preview, dry-run, publish, approval safety)

### Remaining Work (Slice 5)

- `sell` command orchestration tying adapters together
- CLI completion for all commands
- Documentation
