# Shark

Shark is a small CLI and AI skill for preparing second-hand listing text. Give it facts about an item and it prints a draft for you to review and post yourself.

It does not connect to marketplaces, upload photos, publish listings, or send messages. It does not invent missing product facts.

![Animated terminal demo of Shark preparing a listing draft](assets/shark-draft.gif)

## Use the CLI

Requires Node.js 20 or newer. No dependencies or account setup are needed.

```bash
node cli/shark.mjs draft \
  --title "Oak desk" \
  --price 120 \
  --condition good \
  --location "Haifa" \
  --details "Solid wood; small scratch on top"
```

The CLI prints a plain text draft. Required facts are title, price, and condition (`new`, `like_new`, `good`, `fair`, or `poor`). Location and details are optional.

## Use the skill with an AI assistant

Clone this repo and open its folder in your assistant. Node.js 20+ is needed only if you also want to run the CLI. The skill file is [`skills/shark-sell/SKILL.md`](skills/shark-sell/SKILL.md); copy it to the project skill folder for the assistant you use.

### Claude Code

From the repo root, install the project skill and start Claude Code:

```bash
mkdir -p .claude/skills/shark-sell
cp skills/shark-sell/SKILL.md .claude/skills/shark-sell/SKILL.md
claude .
```

Ask for a listing draft or invoke `/shark-sell` in Claude Code. Project skills live under `.claude/skills/` and are available to sessions in this repo. See the [Claude Code skills guide](https://code.claude.com/docs/en/skills).

### Codex

From the repo root, install the skill where Codex looks for project skills:

```bash
mkdir -p .agents/skills/shark-sell
cp skills/shark-sell/SKILL.md .agents/skills/shark-sell/SKILL.md
```

Open the repo in Codex, then type `$shark-sell` or ask for help writing a second-hand listing. If the skill does not appear, restart Codex. See the [Codex skills guide](https://developers.openai.com/codex/skills).

### VS Code with GitHub Copilot

From the repo root, install the skill in VS Code's supported project skills folder:

```bash
mkdir -p .github/skills/shark-sell
cp skills/shark-sell/SKILL.md .github/skills/shark-sell/SKILL.md
```

Open the repo in VS Code, open Copilot Chat, and type `/shark-sell` or ask for a listing draft. VS Code also recognizes `.agents/skills/`. See [Use Agent Skills in VS Code](https://code.visualstudio.com/docs/agent-customization/agent-skills).

### Try it

From the repo root, run the CLI with the item facts. The skill can gather these facts with you, draft the description, and help you review the result:

```bash
npm run shark -- draft \
  --title "Oak desk" \
  --price 120 \
  --condition good \
  --location "Haifa" \
  --details "Solid wood; small scratch on top"
```

The CLI prints a local text draft only. Copy the text you approve and post it yourself.

## Development

```bash
npm test
```

The tests run locally with Node's built in test runner.

## License

MIT. See [LICENSE](LICENSE).
