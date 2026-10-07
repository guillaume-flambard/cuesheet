#!/bin/bash
# usage: gemini-timing.sh <model>...   one tiny request per model, prints HTTP status and seconds. Key never printed.
eval "$(grep -E '^export GEMINI_API_KEY=' "$HOME/.zshrc" | head -1)"
for m in "$@"; do
  body="{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"reply with the single word ok\"}]}"
  out="$(curl -s -m 90 -o /tmp/gt.json -w "%{http_code} %{time_total}s" -H "Authorization: Bearer $GEMINI_API_KEY" -H "Content-Type: application/json" -d "$body" https://generativelanguage.googleapis.com/v1beta/openai/chat/completions)"
  echo "$m -> $out $(head -c 120 /tmp/gt.json | tr '\n' ' ')"
done
