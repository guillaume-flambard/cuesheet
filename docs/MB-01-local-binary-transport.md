# MB-01 — the local binary is the model, and it proposes

## WHY

Every live run so far died at `402 insufficient credits` from OpenRouter. That was
the wrong transport, not a missing account. The owner has been using a local
OpenCode binary all along: `/Users/memo/.opencode/bin/opencode`, and the probe
below costs `0`.

The prior lead recorded this as a dead end (`0bff34c`, `docs/EVIDENCE.md`), and
that record is correct as written. `opencode run` is a full agent with its own
tools. Asked to create one file, it called its own `write` tool, modified the
filesystem, and declared success in its own words. The brief for this slice
re-reads the finding and reaches a different conclusion, because the finding was
about one role and the slice needs a different one.

As a **tool runner**, the binary is unacceptable, and nothing here changes that.
As a **model adapter**, it is usable, and the measured reason is specific.

## THE MEASUREMENT

`opencode run --format json` emits NDJSON: `step_start`, `tool_use`, `text`,
`step_finish`, and `step_finish` carries `cost` and `tokens`. Every step observed
on this machine reported `cost: 0`.

The safety question is not "is the model well-behaved". It is "can the binary
reach the world". That was measured, in a throwaway directory, with the file
listing checked before and after each probe.

```text
P4  --agent plan, benign `ls -A .`
    -> TOOL_EVENT bash status=completed, out= "existing.txt"
    plan executes bash.

P2  --agent plan, "create a file"
    -> TEXT "I can't create that file. Plan mode is read-only."
    refused, but by the model, not by the runtime.

P8  agent with permission {"*": deny, read: allow}, read a file
    -> TOOL_EVENT read status=completed, real output
    the permission layer is selective and really executes what it allows.

P9  same agent, asked to write
    -> TEXT "I don't have a write or edit tool in this session"
    -> no file created

P10 full tool list, permission {edit: deny, bash: deny}
    -> TEXT "I don't have a bash/shell tool in this session"
    -> no file created
```

The finding is the contrast between P4 and P9/P10. A denied tool is **removed
from the tool list the model is offered**, so the model has no verb to call and
no way to reach the world. It is not offered-then-refused, which is the case
where a determined model could still probe. `opencode agent list` shows the
resolved rules, and for a project agent the last matching rule wins.

So `--agent plan` is the wrong lever, and the brief's hint at it is wrong in a
way worth recording: `plan` still carries `bash: * allow` in its resolved
configuration. It refused a write twice, and both refusals were the model's
discretion. A safety argument cannot rest on a model choosing well.

The right lever is a **project-local agent** in a `opencode.json` that Cuesheet
owns, with `tools: {"*": false}` and `permission: {"*": "deny"}`, invoked with
`--pure` so no external plugin can add a tool back.

## WHAT THE BINARY IS TRUSTED TO DO, AND NOT TO DO

**The binary is trusted to be a language model that returns text. It is not
trusted to touch the filesystem, run a command, or be believed.** Cuesheet
configures a project-local agent whose entire tool list and permission set are
empty, runs it with `--pure`, and recovers the model's proposal by parsing the
JSON envelope out of the text it emits. The binary is never asked to perform
anything: it is asked what it would do, and Cuesheet's own `ShellToolRunner`
decides whether to do it. Every tool call the loop sees therefore originates in
Cuesheet's parse of a text response, never in a tool event from the binary, so a
tool call that appears in the log is one Cuesheet chose to run, through the four
verbs, with the exit code recorded. The model can say it is finished; only an
observation can close a goal, exactly as before.

## BEFORE

`src/chat.ts:178-186` requires `OPENROUTER_API_KEY` and returns early with
"there is no local runtime on this machine" when it is absent. That sentence is
false, and it has been read as a real property of the machine rather than a
missing environment variable. `apps/terminal/src/producer/runtime.ts:46` refuses
to build a producer without the same key, so the surface cannot make a live run
here at all. The model id `anthropic/claude-sonnet-4-6` is hardcoded in four
places and names a provider this machine does not use.

## AFTER

`src/adapters/binary-model.ts` exports `BinaryModelAdapter`, which implements
`ModelAdapter` against the local binary and reports tokens and cost from
`step_finish`. The surface and the CLI build it by default. The OPENROUTER gate
is off the default path, and the false sentence is gone. `OpenRouterAdapter`
stays, for a caller that has a key and wants it.

`--dir` is pointed at the resolved project when there is one, so the binary's own
view of the world matches the frame it was given. When the context source is
`scratch` and there is no repository, `--dir` is a throwaway directory Cuesheet
creates, because the binary requires a directory and because pointing it at the
user's home to compensate would be the exact mistake this repository keeps
measuring.

## ACCEPTANCE

1. `npm test`: 591 pass at baseline, 0 fail, plus new tests.
2. A malformed or truncated stream reports failure, never a successful answer.
3. No `tool_use` event is ever honoured. A tool call reaches the loop only via
   the parsed envelope, so the four verbs stay the only path to a change.
4. Tokens and cost are reported from `step_finish`, not invented.
5. A live run against the real binary returns text, and the throwaway directory
   is byte-identical afterwards.
6. PORT-01 keeps passing. Nothing under `src/core/**` changes.

## NON-GOALS

- Deleting `OpenRouterAdapter`. It has a use, and deleting it is not this slice.
- Re-measuring whether the plan agent can be trusted. It cannot.
- Any change to the rendering engine, the four verbs, the frozen capture or the
  oracle.
- Teaching the binary Cuesheet's four verbs. It proposes; the runner acts.

## STOP

Stop and report rather than continue if the deny-all agent ever produces a
`tool_use` event, if the throwaway directory is ever modified, or if the safety
argument can only be made by trusting the model's discretion. The first two are
a broken guarantee. The third is the reason this slice is allowed to exist at
all.
