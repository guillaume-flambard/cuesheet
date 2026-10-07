#!/bin/bash
# Waits until opencode-go/gpt-5.6-luna answers through the serve path Cuesheet uses, then exits 0.
# One tiny request per probe. Gives up (exit 1) after the given number of hours (default 8).
hours="${1:-8}"
here="$(cd "$(dirname "$0")" && pwd)"
probe="$here/serve-probe.mjs"
end=$(( $(date +%s) + hours * 3600 ))
while [ "$(date +%s)" -lt "$end" ]; do
  out="$(cd /tmp && timeout 120 node "$probe" opencode-go/gpt-5.6-luna 2>&1)"
  if echo "$out" | grep -q '"error":null\|"error":undefined' || { echo "$out" | grep -q '"parts":\["text' ; }; then
    echo "luna answers: $(date)"; echo "$out" | cut -c1-200; exit 0
  fi
  echo "$(date +%H:%M) luna still unavailable: $(echo "$out" | grep -oE 'quota[^"]{0,60}|"message":"[^"]{0,80}' | head -1)"
  sleep 1200
done
echo "gave up after ${hours}h"; exit 1
