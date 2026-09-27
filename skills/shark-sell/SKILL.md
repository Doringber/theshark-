---
name: shark-sell
description: Help prepare a clear, accurate second-hand listing from the seller's facts, then format it with the Shark CLI. Use for selling an item or writing marketplace listing copy. Does not publish or message buyers.
---

# Shark listing helper

Help the user prepare a listing they can review and post themselves.

## Workflow

1. Ask for any missing facts: item title, asking price, condition, pickup area, and details or defects the seller wants to mention. Never guess or embellish facts.
2. Draft concise listing copy in the user's language. Keep measurements, age, included accessories, defects, and other claims limited to what the user supplied.
3. If the repo CLI is available, use it to format and validate the supplied facts:

   ```bash
   npm run shark -- draft \
     --title "Oak desk" \
     --price 120 \
     --condition good \
     --location "Haifa" \
     --details "Solid wood; small scratch on top"
   ```

4. Show the draft and invite the user to correct it. The user handles photos and posts the approved text themselves on their chosen marketplace.

## Safety and privacy

- Do not invent missing product details or present assumptions as facts. Ask, or leave them out.
- Do not copy serial numbers, IMEI numbers, identity numbers, or account details from photos into listing text.
- Do not ask for passwords, account tokens, or private buyer conversations.
- This skill and its CLI only help prepare text. They do not open marketplace accounts, upload photos, publish listings, or send messages.
