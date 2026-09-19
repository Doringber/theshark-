---
description: Sell an item on Facebook Marketplace / WhatsApp / Yad2 via Shark (dry-run first, then publish on approval)
argument-hint: <images...> [title] [price]
---

Use the `shark-sell` skill.

The user wants to sell: $ARGUMENTS

1. Confirm the facts you have (images, title, price, condition, location, description,
   platforms and destinations). Ask only for what is missing — never guess a price.
2. Run the dry-run `sell` command and show the per-destination plan.
3. Publish only after an explicit yes, then report the summary block verbatim.
