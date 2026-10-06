#!/bin/bash
# usage: nudge-run.sh <run-number> <openrouter-model> <max-nudges>
# Starts a run, sends the saved natural request, and sends "Continue." (recorded in events.jsonl) each time a slice ends.
here="$(cd "$(dirname "$0")" && pwd)"
d="$HOME/projects/_reports/cuesheet-c02-2026-10-06/public-$1"
eval "$(grep '^export OPENROUTER_API_KEY=' "$HOME/.zshrc")"
export C02_PROVIDER=openrouter C02_MODEL="$2"
node "$here/public-run.mjs" "$1" > /dev/null 2>&1 &
sleep 8
python3 "$here/send-request.py" "$d"
nudges=0
for i in $(seq 1 24); do
  sleep 60
  if grep -q "still open after" "$d/screen.txt" && [ "$nudges" -lt "$3" ]; then
    nudges=$((nudges + 1))
    printf '%s\n%s\n' '{"send":"Continue."}' '{"key":"enter"}' >> "$d/actions.jsonl"
  fi
done
