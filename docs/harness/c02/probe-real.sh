#!/bin/bash
# usage: probe-real.sh <first-run-number> <openrouter-model>...   real request, 150 s, then tool-call shape summary
here="$(cd "$(dirname "$0")" && pwd)"
reports="$HOME/projects/_reports/cuesheet-c02-2026-10-06"
eval "$(grep '^export OPENROUTER_API_KEY=' "$HOME/.zshrc")"
export C02_PROVIDER=openrouter
n="$1"; shift
for m in "$@"; do
  C02_MODEL="$m" node "$here/public-run.mjs" "$n" > /dev/null 2>&1 &
  sleep 8
  d="$reports/public-$n"
  python3 "$here/send-request.py" "$d"
  sleep 150
  echo "== $m (run $n)"
  grep -v '^\s*$' "$d/screen.txt" | tail -4 | cut -c1-150
  python3 "$here/tool-shapes.py" "$d"
  echo '{"quit":true}' >> "$d/actions.jsonl"
  sleep 3
  n=$((n + 1))
done
