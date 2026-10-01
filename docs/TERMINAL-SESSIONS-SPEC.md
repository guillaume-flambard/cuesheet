# Durable terminal sessions

## Scope

The terminal currently loses its conversation and harness log on process exit.
Connect it to the existing fsync-backed SessionStore through an adapter. Keep
src/core unchanged. Each terminal session owns a core journal, a view journal,
and non-secret metadata identifying its working directory and pinned check.

## User flow

A launch creates a fresh session. Ctrl+K exposes Sessions, New session, and
Resume work. Sessions lists recent conversations with their directory and goal.
Loading a session restores history and draft but starts no model and runs no tool.
Resume work explicitly continues the open goal with its stored directives and
observations. A closed goal is not resumed. Startup --session ID loads a session
without automatic work; CUESHEET_SESSIONS selects the storage root.

## Durability and admission

Persist harness events before publishing them to memory. Persist tool intent
before executing the tool, since the current loop records its action after the
runner returns. A process crash during a tool leaves an uncertain intent; it
must not be automatically retried. Restored active rows become unknown, busy
becomes false, and the user sees that the process stopped.

Persist view controls before displaying their outcome. The bounded display is
reconstructed from the full view journal. Storage failure disables further work
and is shown explicitly; do not claim a durable event the disk refused.

Only one live terminal writer may hold a session. Writer claims have unique
names containing process identity; dead claims are recoverable on restart.
A competing live writer is refused, not silently forked. Damaged or missing
journals refuse loading and are never truncated or overwritten.

Pin the original completion check across restarts. A changed original file must
not weaken the criterion. Reuse its saved bytes and digest. A conflicting
--verify on an existing session refuses rather than replacing its requirement.
Old verdicts remain historical results about their frozen artifacts, not claims
about the current workspace.

## Acceptance

- Real process restart restores conversation, draft and ordered core events.
- Explicit continuation sees prior directives and tool observations.
- Killed work reloads idle/unknown and performs no automatic effects.
- Verification criteria stay identical despite mutation of the original script.
- A closed goal refuses continuation; proof records remain reachable.
- Missing, damaged, foreign or concurrently held sessions refuse safely.
- Write failure prevents the next model/tool and shows the persistence failure.
- Keyboard session selection/new/resume fits the viewport and does not submit
  the composer accidentally.
- Automated tests and review pass; live provider inference trials remain separate.
