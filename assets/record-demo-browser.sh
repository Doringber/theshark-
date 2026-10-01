#!/bin/sh
set -e
cd "$(dirname "$0")/.."

printf '%b\n' \
  '\033[1;32m$\033[0m npm run shark -- draft \\' \
  '  --title "Oak desk" --price 120 --condition good \\' \
  '  --location "Haifa" --details "Solid wood; small scratch on top"'
npm run shark -- draft \
  --title "Oak desk" \
  --price 120 \
  --condition good \
  --location "Haifa" \
  --details "Solid wood; small scratch on top"

printf '%b\n' '\033[1;32m$\033[0m npm run shark -- browser'
npm run shark -- browser

printf '%b\n' '\033[1;32m$\033[0m npm run shark -- check --platform yad2'
npm run shark -- check --platform yad2

printf '%b\n' \
  '\033[1;32m$\033[0m npm run shark -- fill --platform yad2 \\' \
  '  --title "Oak desk" --price 120 --condition good \\' \
  '  --location "Haifa" --details "Solid wood; small scratch on top"'
npm run shark -- fill --platform yad2 \
  --title "Oak desk" \
  --price 120 \
  --condition good \
  --location "Haifa" \
  --details "Solid wood; small scratch on top"

node assets/capture-browser-screenshot.mjs >/dev/null
sleep 1
