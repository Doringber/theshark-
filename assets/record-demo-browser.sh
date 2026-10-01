#!/bin/sh
set -e
cd "$(dirname "$0")/.."

run_draft() {
  node cli/shark.mjs draft \
    --title "Oak desk" \
    --price 120 \
    --condition good \
    --location "Haifa" \
    --details "Solid wood; small scratch on top"
}

run_fill_facebook() {
  node cli/shark.mjs fill --platform facebook \
    --title "Oak desk" \
    --price 120 \
    --condition good \
    --location "Haifa" \
    --details "Solid wood; small scratch on top"
}

run_fill_whatsapp() {
  if [ -n "$SHARK_DEMO_WA_TO" ]; then
    node cli/shark.mjs fill --platform whatsapp --wa-to "$SHARK_DEMO_WA_TO" \
      --title "Oak desk" \
      --price 120 \
      --condition good \
      --location "Haifa" \
      --details "Solid wood; small scratch on top"
  else
    node cli/shark.mjs fill --platform whatsapp \
      --title "Oak desk" \
      --price 120 \
      --condition good \
      --location "Haifa" \
      --details "Solid wood; small scratch on top"
  fi
}

run_fill_yad2() {
  node cli/shark.mjs fill --platform yad2 \
    --title "Oak desk" \
    --price 120 \
    --condition good \
    --location "Haifa" \
    --details "Solid wood; small scratch on top"
}

printf '%b\n' \
  '\033[1;32m$\033[0m node cli/shark.mjs draft \\' \
  '  --title "Oak desk" --price 120 --condition good \\' \
  '  --location "Haifa" --details "Solid wood; small scratch on top"'
run_draft

printf '%b\n' '\033[1;32m$\033[0m npm run shark -- browser'
npm run shark -- browser

for platform in facebook whatsapp yad2; do
  printf '%b\n' "\033[1;32m\$\033[0m npm run shark -- check --platform $platform"
  npm run shark -- check --platform "$platform"
done

printf '%b\n' \
  '\033[1;32m$\033[0m npm run shark -- fill --platform facebook \\' \
  '  --title "Oak desk" ...'
run_fill_facebook

printf '%b\n' \
  '\033[1;32m$\033[0m npm run shark -- fill --platform whatsapp \\' \
  '  --title "Oak desk" ...'
run_fill_whatsapp

printf '%b\n' \
  '\033[1;32m$\033[0m npm run shark -- fill --platform yad2 \\' \
  '  --title "Oak desk" ...'
run_fill_yad2

node assets/capture-e2e-screenshots.mjs >/dev/null
sleep 1
