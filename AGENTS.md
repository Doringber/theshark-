# Shark development rules

- This project prepares listing text only. Do not add marketplace publishing, messaging, account login, or photo upload automation.
- Use only facts supplied by the user. Never reproduce serial numbers, IMEIs, identity numbers, or account details from images.
- Keep the CLI local and dependency free unless a concrete need justifies a dependency.
- Add or update CLI behavior tests before implementation, run them to confirm the expected failure, then implement the smallest change.
- Preserve unrelated user changes. Do not commit, push, publish, or deploy unless explicitly asked.
- Before calling a change complete, run formatting check, lint, typecheck, build, and the test suite when those checks are configured.
