#!/bin/bash
# Lists the Gemini models the key can call through the OpenAI-compatible endpoint. The key is never printed.
line="$(grep -E '^export (GEMINI|GOOGLE)[A-Z_]*API_KEY=' "$HOME/.zshrc" | head -1)"
[ -n "$line" ] || { echo "no GEMINI/GOOGLE API key export in ~/.zshrc"; exit 1; }
eval "$line"
key="${GEMINI_API_KEY:-$GOOGLE_API_KEY}"
echo "variable: $(echo "$line" | sed -E 's/^export ([A-Z_]+)=.*/\1/') (length ${#key})"
curl -s -m 30 -H "Authorization: Bearer $key" https://generativelanguage.googleapis.com/v1beta/openai/models -o /tmp/gem-models.json -w "http %{http_code}\n"
python3 - <<'P'
import json
try:
    d=json.load(open('/tmp/gem-models.json'))
    ids=[m['id'].replace('models/','') for m in d.get('data',[])]
    print(len(ids),'models'); print('\n'.join(i for i in ids if 'flash' in i or 'pro' in i)[:1500])
except Exception as e:
    print(open('/tmp/gem-models.json').read()[:300])
P
