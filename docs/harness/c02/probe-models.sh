#!/bin/bash
# Probe: for each model, start a public-run, send a trivial prompt, print the last screen lines.
# usage: probe-models.sh <first-run-number> <model> [<model>...]   (models without the provider prefix)
here="$(cd "$(dirname "$0")" && pwd)"
reports="$HOME/projects/_reports/cuesheet-c02-2026-10-06"
n="$1"; shift
for m in "$@"; do
  C02_MODEL="opencode/$m" node "$here/public-run.mjs" "$n" > /dev/null 2>&1 &
  sleep 8
  d="$reports/public-$n"
  printf '%s\n%s\n' '{"send":"Reply with the single word ok. Do not use tools."}' '{"key":"enter"}' >> "$d/actions.jsonl"
  sleep 30
  echo "== $m (run $n)"
  grep -v '^\s*$' "$d/screen.txt" | tail -4 | cut -c1-140
  echo '{"quit":true}' >> "$d/actions.jsonl"
  sleep 2
  n=$((n + 1))
done
