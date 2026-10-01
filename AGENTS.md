# Shark development rules

- Default to listing prep and dry-run form fill. Do not add one-click publish, messaging automation, automated credential login, or silent photo upload.
- Use only facts supplied by the user. Never reproduce serial numbers, IMEIs, identity numbers, or account details from images.
- Keep dependencies minimal: `playwright-core` attaches to the user's Shark Chrome only (no bundled browser). Do not add heavy marketplace orchestration back.
- Add or update CLI behavior tests before implementation, run them to confirm the expected failure, then implement the smallest change.
- Preserve unrelated user changes. Do not commit, push, publish, or deploy unless explicitly asked.
- Before calling a change complete, run formatting check, lint, typecheck, build, and the test suite when those checks are configured.
