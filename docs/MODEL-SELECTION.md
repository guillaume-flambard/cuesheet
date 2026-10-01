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

In the terminal, Ctrl+K → Provider et modèle opens the selector. Choose a
provider with arrows/Enter, search its live catalog, or press Tab for a manual
model ID. Compatible servers prompt for the endpoint. HTTP transports prompt
for an optional output limit. OpenCode uses its own configured limit and
refuses an explicit Cuesheet output ceiling. The final screen offers Apply and save by default;
up/down switches to Apply for this terminal only. Escape returns to the conversation.
OpenCode can retain its configured model instead of choosing a catalog entry.

Selection is refused while a task is running. Applying while idle changes the
adapter without replacing the producer, its event store, directives or evidence.
The header and journal identify the applied selection. Missing credentials do not
block opening the selector. A failed change keeps the previous adapter.

Saved non-secret defaults live in $XDG_CONFIG_HOME/cuesheet/models.json, or
~/.config/cuesheet/models.json. Writes are atomic and mode 0600. Startup flags and
environment preferences override these defaults. Saved model, endpoint and output
limit belong to their provider and are not inherited by a different provider.
Malformed configuration is reported without echoing its contents and can be
replaced through the selector. Credentials are never saved.

Catalog requests are cancelled on close, timed out after 10 seconds and never
replace a newer result. OpenRouter excludes models explicitly lacking tool support.
OpenAI and compatible catalogs do not establish coding/tool capability. Manual
entry remains available on catalog errors. Actual metadata trials on 2026-10-01
returned 540 OpenCode IDs in 866 ms and 396 filtered OpenRouter IDs in 409 ms.
These counts are observations, not a fixed inventory or proof of task quality.

Still pending: direct Anthropic, subscription OAuth, streaming, provider-specific
inference trials, and durable terminal sessions. Choosing opencode still depends
on its binary. Choosing an HTTP transport does not launch it.

Protocol references:
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart) and
[OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat).

Validation: provider routing, persistence, continuity, cancellation and actual
keyboard/rendering regressions; full suite recorded in PROVIDER-UX-TODO.md.
