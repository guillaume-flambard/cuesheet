# Explicit terminal memory

Manual overrides record human decisions, constraints and questions in the existing
session journal. Automatic maintenance is described in AUTONOMOUS-WORK.md and
records model interpretations with source sequences and a rationale. The context
and `/memory` listing distinguish model authorship from human authorship. A human
edit takes ownership of a model record; subsequent model edits of it are refused.
Both use note events with a typed adapter payload, not new core
events. Human records are context, never evidence that a goal is complete.

Commands in the composer:

- `/memory` lists current records and their identifiers.
- `/memory decision TEXT`, `/memory constraint TEXT`, `/memory question TEXT` add a record.
- `/memory edit ID TEXT` replaces the current wording while retaining prior events.
- `/memory resolve ID TEXT` records an answer or reason and makes the record inactive.

An identifier is the sequence of its creation, prefixed with `m-`. Editing a
resolved record reopens it. A memory command alone never launches inference.
Changes during work invalidate outstanding proposals and reach the next frame.
Storage failures must not publish a successful memory update. Reloading a session
restores records through the journal, with no second memory file.

Acceptance: record, edit, resolve, reopen, restart, and substitute a model;
preserve source revisions and history; refuse malformed commands and unknown IDs;
never treat a memory decision as verified completion.

This is the first functional input surface. A discoverable memory editor and
explicit objective editing remain to implement. Constraints here guide the model;
they are not a shell sandbox or machine-enforced access policy.

Validation: full suite before the additional disk-refusal regression: 671 tests,
669 passing, 2 skipped, no failures. The three memory regressions pass, including
restart/provider substitution, stale tool rejection, and refusal before publication
when the durable journal cannot be written. No core file is modified.
