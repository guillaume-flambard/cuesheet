# Provider and model selection

The terminal now forwards model preferences to its producer. Previously it
forwarded the OpenRouter credential but dropped CUESHEET_PROVIDER and
CUESHEET_MODEL, so an explicit choice could silently run the local binary.

Choose at startup. Flags override environment preferences:

```sh
cuesheet surface --provider openrouter --model anthropic/claude-sonnet-4-6 --max-tokens 4096
cuesheet surface --provider openai --model YOUR_MODEL_ID --max-tokens 4096
cuesheet surface --provider compatible --base-url http://localhost:11434/v1 --model YOUR_LOCAL_MODEL
cuesheet surface --provider opencode --model PROVIDER/MODEL
```

| Provider | Credential | Transport |
| --- | --- | --- |
| opencode (default) | OpenCode's existing configuration | Local OpenCode binary |
| openrouter | OPENROUTER_API_KEY | Direct Chat Completions HTTP |
| openai | OPENAI_API_KEY | Direct OpenAI Chat Completions HTTP |
| compatible | Optional CUESHEET_API_KEY | CUESHEET_BASE_URL or --base-url, including /v1 |

OpenAI and compatible require an explicit model. OpenRouter retains its previous
default if none is specified. Compatible servers must implement Chat Completions
with function calling. A model that does not support tools cannot perform this
coding workflow. OpenAI API authentication is independent from a ChatGPT
subscription; no subscription credentials are imported.

Environment alternatives: CUESHEET_PROVIDER, CUESHEET_MODEL,
CUESHEET_MAX_TOKENS, CUESHEET_BASE_URL. Keys remain environment variables and
are never CLI arguments. The launcher passes only named model variables and
PATH/HOME/TERM, not the entire environment. Unknown providers refuse rather
than fall back. The header shows transport and explicit model.

OpenAI uses max_completion_tokens; OpenRouter and compatible use max_tokens.
The output limit is optional, must be a positive integer when provided, and
includes reasoning tokens where the provider counts them. No provider call was
made in the automated validation: request routing, auth, limit, tool decoding
and cancellation were verified with a deterministic fake HTTP response.

Still pending: an interactive selector, live model catalog, persistent user
preferences, direct Anthropic transport, subscription OAuth, streaming, and
provider-specific integration trials. Choosing opencode still depends on its
binary. Choosing an HTTP transport does not launch it.

Protocol references:
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart) and
[OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat).

Validation: 653 tests, 651 passed, 2 skipped; no new type diagnostics.
