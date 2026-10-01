# Surface execution repair, 2026-10-01

The terminal drive in SURFACE-DOGFOOD-2 found that the installed launcher
used the terminal app directory as its workspace, declared no command vocabulary,
and hid every model answer. The accompanying audit reproduced an executable
mismatch in ShellToolRunner and found that a stale model response survived a
mid-inference directive.

## Changes

- The launcher inherits the caller working directory.
- The live producer declares its accepted command names and argv convention.
- Model text is rendered as Cuesheet text, separate from evidence and confirmed
  tool results. A completion claim still cannot close the goal.
- The runner requires argv[0] to equal the declared tool name. Declaring cat can
  no longer execute Node instead.
- An inference whose revision moved returns no text or tool calls. The next
  inference recompiles from the shared log. No stale response is replayed.
- If instructions change while a tool runs, remaining calls from that response
  are refused. The already running tool is allowed to finish.
- The direction row reports receipt and discarded proposals, not proof that
  the work has already applied the instruction.

## Verification

`node --test --test-skip-pattern='MB-01 a real run against the installed binary' 'test/**/*.test.ts'`

633 tests, 631 pass, 0 fail, 2 skipped. The binary live suite was excluded;
these results do not establish current provider availability.

The new regression tests cover executable mismatch, legitimate command execution,
stale text and calls during inference, a directive arriving during a tool, visible
answers without goal closure, and declared vocabulary in the model frame.

A real PTY drive also passed from two distinct temporary directories (`alpha`
and `beta`) through the installed command. It used a fake OpenCode executable
speaking the real NDJSON protocol, the real BinaryModelAdapter, the real
ShellToolRunner and a real `cat seed.txt`. Both runs displayed their actual
caller directory and the model answer derived from the tool output. Raw PTY
captures are at `/tmp/cuesheet-pty-mm_stvh2/alpha.raw` and `beta.raw`.
This is terminal and wiring evidence with a simulated model, not a live-model
quality or availability measurement.

## Limits

This runner is not an OS sandbox. An allowed Node process, package script or
Git command retains its own authority; validating the executable name does not
validate every argument or confine every file access. This change closes the
reproduced declaration mismatch, not arbitrary execution under an allowed command.

The terminal still uses its existing step budget and evidence rules. Answers are
shown, but no new completion oracle is introduced. Palette, inspect keys and
header rendering defects from the drive are outside this repair.

## Follow-up: terminal controls and live model

The palette now renders View the log and Help. Ctrl+K opens it; Ctrl+L opens
Inspect (Tab, the byte shared with Ctrl+I, is also accepted). Composer text input
is inactive while an overlay handles Enter, so selecting a command or project
does not also submit a run. The empty composer shows an inverse cursor cell.
The malformed literal cursor-control writes were removed; Ink manages the
terminal cursor. Inspect limits its visible tail to terminal height and truncates
long lines, while retaining the complete log in surface state.

`test/surface-keys.test.ts` drives real key bytes through a PTY, with a fake
binary and the real application. It observes palette rendering, Enter opening
an empty log without starting a run, Ctrl+L, a visible model answer, and Ctrl+L
opening the populated log. This test passed individually.

A bounded live model check was also run on 2026-10-01 in a throwaway workspace.
The actual local OpenCode adapter proposed cat seed.txt, the real ShellToolRunner
returned exit 0 and CUESHEET-LIVE-SEED, and the next inference accurately reported
that observed content. Two steps ended budget-exhausted with zero evidence;
no model claim was converted to goal closure.

Usage reported by the live provider: 53,160 and 54,122 total tokens, with 51,143
and 52,086 input tokens respectively; reported monetary cost 0 for both.
The local transport is therefore not a small-context model interface merely
because Cuesheet's own frame is small. Attribution of the extra context and its
reduction remain unmeasured. The general header redraw problem on long timelines
is not claimed solved by the bounded Inspect view.

Final suite after the terminal fixes: 634 tests, 632 pass, 0 fail, 2 skipped,
using the same command above. Live binary tests remain excluded from the suite;
the bounded live check is recorded separately. git diff --check also passed.

## Owner-declared completion check

Launch with `cuesheet surface --verify /absolute/path/check.mjs`. The owner
provides a self-contained Node module that inspects the workspace through its
current directory and exits zero only when the acceptance condition holds.
The module is pinned before model admission. The model can request the `finish`
tool but cannot select a different command or replace the pinned oracle.

Each request captures the workspace outside the source tree, then runs the
check asynchronously against that copy. Exit zero gives VERIFIED; a nonzero
exit gives REJECTED; timeout, process failure, changed capture, or changed
oracle gives INCONCLUSIVE. Only a VERIFIED result for the current directive
basis produces evidence and closes the goal. A new directive during checking
is accepted immediately and prevents closure for the old request. Later calls
in a batch after closure are refused. Without a declared check, finish cannot
close the goal.

Captures, pinned scripts, and JSON proof records are stored beneath
`~/.local/state/cuesheet/verification`. Records include artifact identity,
digest, effect ID, verdict, and check digest. Capture excludes .git,
node_modules, .DS_Store, .env variants, .npmrc, and .pypirc from both copied
bytes and digest traversal. This is not an operating-system sandbox or a
guarantee that all possible secrets are excluded. The check proves the selected
condition, whose adequacy remains the owners responsibility. Full session
restart/resume is not implemented by these proof records.

Regression coverage includes accepted and rejected real executions, attempted
replacement of the oracle, timeout, capture mutation, directive arrival while
checking, secret-file exclusion, and no-contract nonclosure. A real PTY test
launches the CLI with --verify and observes independent verification and goal
settlement using a fake model transport and real file execution. The earlier
live provider check did not exercise finish. The later live completion and
repair checks below establish the bounded current path.

Validation after completion wiring: 641 tests, 639 pass, 0 fail, 2 skipped
with the deterministic-suite command above. The typecheck differential guard
also passed (4 tests), and git diff --check passed.

## Measured transport and terminal quality

On 2026-10-01 the installed OpenCode binary reported version 1.18.34.
Its official tagged source and config documentation were consulted:
https://opencode.ai/docs/config/ and
https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/session/instruction.ts .
Inline OPENCODE_CONFIG_CONTENT follows project settings in the config merge
order. The adapter now supplies its proposal-agent config through that variable
on every inference, including project runs, without rewriting project config.
This fixes the missing no-tools agent config in project runs. Other provider
settings and project instructions remain inherited; this does not imply full
context isolation or an OS sandbox.

A same-goal live experiment created answer.txt with exactly two bytes, 42,
and requested independent finish. Before the fix, project inference reported
50,470 input tokens at step 1 and took three inferences (including a failed
model-generated read-back command) before independent acceptance. After the
fix it reported 5,127 input tokens at step 1 and reached acceptance in one
inference. Reported cost was zero. This is one observed comparison, not a
general quality or latency benchmark. A scratch run also reached acceptance.

The repeatable opt-in command is
`node scripts/measure-surface-quality.ts --live`. It uses the configured local
model to repair sum.mjs so an empty array returns zero, then checks empty,
positive, negative, zero, and fractional cases with the pinned owner oracle.
The measured run was accepted in three inferences, with input tokens
6,970 / 7,154 / 7,388 and model times 4,846 / 11,218 / 5,698 ms.
It keeps the fixture, full log, acceptance proof, and measurement.json in
a temporary measurement directory. The command bounds each inference to
45 seconds and the run to four inferences.

For Ink 4.4.1, the official tagged documentation was consulted:
https://github.com/vadimdemedes/ink/blob/v4.4.1/readme.md .
The shell now reserves a terminal-height viewport and clips the timeline
from the top while retaining the most recent wrapped lines. The composer
keeps its final text visible on one row, narrow terminals use their actual
width, and resize updates the row budget. Stored entries and the full log
are retained; this is a viewport, not persistent history or manual scrolling.

PTY validation requires continuous output draining: a full-height frame can
fill the PTY buffer while a test sleeps, preventing startup effects from
finishing before input is sent. The driver now drains while waiting and
uses explicit Expect argument lists for its timeouts. Both keyboard and
verified-completion PTY tests pass with the bounded viewport. Inline provider
preferences are preserved when injecting the proposer config.

Final quality validation: 643 tests, 641 pass, 0 fail, 2 skipped using
the deterministic suite command. Differential typecheck guard: 4 pass.
The accepted live runs are recorded separately above. git diff --check
passes and src/core remains unchanged.
