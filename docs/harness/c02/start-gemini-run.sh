#!/bin/bash
# usage: start-gemini-run.sh <run-number> <gemini-model>   (key read from ~/.zshrc, never printed)
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(grep -E '^export GEMINI_API_KEY=' "$HOME/.zshrc" | head -1)"
export C02_PROVIDER=compatible C02_MODEL="$2"
export CUESHEET_MIN_INTERVAL_MS="${CUESHEET_MIN_INTERVAL_MS:-7000}"
export CUESHEET_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/" CUESHEET_API_KEY="$GEMINI_API_KEY"
exec node "$here/public-run.mjs" "$1"
