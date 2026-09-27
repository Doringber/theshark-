# Shark

Shark is a small CLI and AI skill for preparing second-hand listing text. Give it facts about an item and it prints a draft for you to review and post yourself.

It does not connect to marketplaces, upload photos, publish listings, or send messages. It does not invent missing product facts.

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

## Use the skill

Install or copy [`skills/shark-sell/SKILL.md`](skills/shark-sell/SKILL.md) into your AI assistant's skills directory. Ask the assistant to help write a listing; it will gather missing facts, prepare copy, and help you review it.

## Development

```bash
npm test
```

The tests run locally with Node's built in test runner.

## License

MIT. See [LICENSE](LICENSE).
