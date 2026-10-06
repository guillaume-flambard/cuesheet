#!/bin/bash
# usage: start-openrouter-run.sh <run-number> <model>   (key read from ~/.zshrc, never printed)
here="$(cd "$(dirname "$0")" && pwd)"
eval "$(grep '^export OPENROUTER_API_KEY=' "$HOME/.zshrc")"
export C02_PROVIDER=openrouter C02_MODEL="$2"
exec node "$here/public-run.mjs" "$1"
