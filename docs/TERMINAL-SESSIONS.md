# Terminal sessions and restart

Every normal terminal launch starts a fresh durable conversation. Ctrl+K exposes
Sessions, Nouvelle session and Reprendre le travail. Opening a session restores
its conversation and draft but starts no model and launches no tool. Resume work
explicitly continues its open goal; a goal already independently verified stays
closed. A new submitted message starts new work in the same conversation.

To load a known session at startup:

```sh
cuesheet surface --session t-YOUR_SESSION_ID
```

The ID appears in Ctrl+L's session line. Startup provider/model flags still
apply and override the saved selection. A model chosen for this terminal is
also retained in the session journal, without its credentials.

Storage defaults to ~/.local/state/cuesheet/terminal/sessions, respecting
XDG_STATE_HOME. CUESHEET_SESSIONS overrides the root. The launcher forwards these
variables and CUESHEET_SESSION explicitly. Each session has a versioned metadata
file, a harness .jsonl journal, and a .view.jsonl journal for the conversation.
New files have mode 0600. No credential configuration is persisted.

The adapter writes harness events through the existing SessionStore before
publishing them in the in-memory EventStore. It fsyncs view controls before
showing their result. Draft input is written as well. Metadata records the
original working directory and, when declared, the pinned criterion and digest.
The harness core is unchanged.

The current loop records its action after the runner returns. Therefore the
terminal additionally writes a requested tool intent before executing it.
Loading after a killed process resets busy/active rows to unknown and explains
that nothing was automatically retried. Explicit resume asks the model to inspect
the current workspace before repeating an uncertain effect. This is not rollback
or exactly-once tool execution. An operating-system child that outlives its parent
is not guaranteed to have stopped; an interrupted effect remains uncertain.

The pinned acceptance script is reused across processes. Editing the original
source file does not weaken its requirement. Passing a different --verify to an
existing session refuses. Missing or changed pinned bytes also refuse loading.
Historical verification identifies its frozen artifact and proof path; it does
not establish that the current workspace still has those bytes.

A unique writer claim allows one live terminal per session. A dead process's
claim is removed on restart. Simultaneous claimants may both be refused; neither
silently forks the journal. PID reuse may conservatively refuse an old claim.
External writers that ignore the claim are outside this protocol; observed
journal changes halt the terminal. These are process-restart guarantees, not a
filesystem sandbox or a power-loss transaction across metadata and both logs.

An unreadable, missing or damaged journal is never overwritten. A storage error
publishes a visible failure, cancels current work and prevents further model/tool
calls. Navigation and inspection remain available. An action whose result was not
persisted stays unknown. If the last task targeted a directory other than the
session's launch directory, resume refuses and asks for a fresh session there.

Validation covers real process kill/reload, cross-process continuation with a
mutated source check, pinned-byte tampering, preserved directives and history,
closed-goal refusal, concurrent writers, damage, core/view write failures and
actual Ink keyboard flows for load/new/resume. Model inference is simulated in
these tests; existing live trials are recorded in SURFACE-EXECUTION-REPAIR.md.
