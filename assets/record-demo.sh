#!/bin/sh

printf '%b\n' \
  '\033[1;32m$\033[0m node cli/shark.mjs draft \\' \
  '  --title "Oak desk" \\' \
  '  --price 120 \\' \
  '  --condition good \\' \
  '  --location Haifa \\' \
  '  --details "Solid wood; small scratch on top"'
node cli/shark.mjs draft \
  --title "Oak desk" \
  --price 120 \
  --condition good \
  --location "Haifa" \
  --details "Solid wood; small scratch on top"
sleep 2
