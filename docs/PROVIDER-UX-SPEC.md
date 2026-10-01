# Provider selection in the terminal

## Problem

Startup flags work, but changing a model requires restarting the terminal and
remembering an identifier. Preferences disappear after exit. The provider choice
must be visible, recoverable when credentials are missing, and must preserve the
conversation and the harness log.

## Slice being implemented

Open “Provider et modèle” from Ctrl+K. Choose a provider, search its model
catalog, or type a model identifier when the catalog is unavailable. Compatible
servers also need a base URL. Apply only while idle; a running task keeps its
transport until it ends or the user interrupts it. Changing a model must retain
the same producer and event store, including directives and evidence.

An explicit Apply uses the choice for this terminal. Apply and save also writes
non-secret preferences to the user's configuration directory. Saved preferences
are defaults; startup flags and environment preferences override them. A provider
change must not inherit a saved model belonging to another provider.

Catalog reads happen only after opening the selector. They have a timeout, are
cancelled when the selector closes or provider changes, and cannot overwrite a
newer result. Errors keep manual entry available. A listed model is not a promise
of coding or tool support. OpenRouter may identify tool support in its metadata;
other catalogs cannot establish that.

Credentials stay in named environment variables. No key entry in the selector,
no key persisted, no provider response body echoed on catalog failures. Missing
credentials must not silently select another provider.

## Acceptance criteria

- Ctrl+K exposes provider/model selection, including when initial setup is missing.
- Up/down and Enter choose; typing filters models; manual model entry works.
- Provider, model and compatible endpoint are reviewable before applying.
- Failed selection leaves the active adapter unchanged.
- Busy selection refuses; subsequent idle selection keeps the existing log.
- Saved non-secret preferences survive restart and respect explicit overrides.
- Malformed saved configuration is explained without printing its contents.
- Catalog races, close, HTTP failure and timeout are handled.
- Rendering fits the available viewport and input does not leak to the composer.
- Automated tests verify routing and continuity; real API calls are separate trials.

## Later replacement milestones

Durable terminal sessions and resume, direct Anthropic transport, subscription
OAuth, provider streaming, and multi-file task benchmarks remain separate work.
No claim of full OpenCode equivalence follows from this slice.
