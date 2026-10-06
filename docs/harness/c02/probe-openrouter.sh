#!/bin/bash
# usage: probe-openrouter.sh <first-run-number> <model> [<model>...]   e.g. nvidia/nemotron-3-ultra-550b-a55b:free
# The key is read from the owner's ~/.zshrc export line and never printed.
here="$(cd "$(dirname "$0")" && pwd)"
reports="$HOME/projects/_reports/cuesheet-c02-2026-10-06"
eval "$(grep '^export OPENROUTER_API_KEY=' "$HOME/.zshrc")"
[ -n "$OPENROUTER_API_KEY" ] || { echo "no OPENROUTER_API_KEY in ~/.zshrc"; exit 1; }
export C02_PROVIDER=openrouter
n="$1"; shift
for m in "$@"; do
  C02_MODEL="$m" node "$here/public-run.mjs" "$n" > /dev/null 2>&1 &
  sleep 8
  d="$reports/public-$n"
  printf '%s\n%s\n' '{"send":"Reply with the single word ok. Do not use tools."}' '{"key":"enter"}' >> "$d/actions.jsonl"
  sleep 40
  echo "== $m (run $n)"
  grep -v '^\s*$' "$d/screen.txt" | tail -5 | cut -c1-140
  echo '{"quit":true}' >> "$d/actions.jsonl"
  sleep 2
  n=$((n + 1))
done
