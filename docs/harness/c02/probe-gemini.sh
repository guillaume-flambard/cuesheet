#!/bin/bash
# usage: probe-gemini.sh <first-run-number> <model>...   real request, 150 s, then tool-call shape summary
here="$(cd "$(dirname "$0")" && pwd)"
reports="$HOME/projects/_reports/cuesheet-c02-2026-10-06"
n="$1"; shift
for m in "$@"; do
  bash "$here/start-gemini-run.sh" "$n" "$m" > /dev/null 2>&1 &
  sleep 8
  d="$reports/public-$n"
  python3 "$here/send-request.py" "$d"
  sleep 150
  echo "== $m (run $n)"
  grep -v '^\s*$' "$d/screen.txt" | tail -5 | cut -c1-150
  python3 "$here/tool-shapes.py" "$d"
  echo '{"quit":true}' >> "$d/actions.jsonl"
  sleep 3
  n=$((n + 1))
done
