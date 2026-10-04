# Surface Dogfood 2: the first person to open it

**Date of measurement**: 2026-10-01.
**Commit**: `5711959`, `main`, clean and in sync before and after.
**A real TTY was achieved.** `/usr/bin/expect` with `stty_init`, so Ink got the
pty it refuses to start without. This is the record of a person driving the
surface, not of a test asserting about it.

Three leads before this one ended their packets admitting the same thing: the Ink
surface had been proved by tests and never by a person. This is that drive.

## How it was driven

`expect` allocates a genuine pty, sets the window, drives the installed `cuesheet`
command, and writes every byte the process emits to a raw log. The raw log is
then replayed through `pyte` (a VT100 emulator in a venv outside the repository)
so that what is quoted below is what a terminal would have shown, not a
decolourised approximation.

Everything lives under `/var/folders/.../T/opencode/drive`. No real repository
was used as a workspace, and no `opencode` invocation was given `--auto`.

```bash
# the driver (driveH.exp), one representative run
cd /var/folders/9l/jsy6rgt160v3z3vrkqqjhdyh0000gn/T/opencode/drive
cat > driveH.exp <<'EOF'
#!/usr/bin/expect -f
set stty_init {rows 45 columns 110}
set timeout 1
set T0 [clock milliseconds]
log_user 0
log_file -a driveH.raw
spawn env TERM=xterm-256color HOME=$env(HOME) cuesheet
proc snap {name} { global T0; set dt [expr {[clock milliseconds]-$T0}]
  send_user "<<<SNAP $name \[${dt}ms\]>>>\n" }
proc tick {} { expect { -re {(?s).} {} timeout {} } }
proc waitms {ms} { set end [expr {[clock milliseconds]+$ms}]
  while {[clock milliseconds] < $end} { tick } }
tick; tick
snap frame
send "dis-moi ce que tu vois dans ce dossier"
waitms 1200
send "\r"
waitms 60000
snap run-60s
waitms 60000
snap run-120s
waitms 90000
snap run-210s
waitms 120000
snap run-330s
catch {send "\003"}
sleep 2
catch {expect eof}
EOF
/usr/bin/expect driveH.exp > driveH.log 2>&1

# the replay: raw bytes -> the screen a terminal would show
/var/folders/9l/jsy6rgt160v3z3vrkqqjhdyh0000gn/T/opencode/vtvenv/bin/python replay3.py driveH.raw
```

The replay tool is 15 lines: split the raw log on the snapshot markers, feed each
intervening chunk to a `pyte.Screen(110, 45)`, print `screen.display` plus the
cursor position. Artifacts kept: `driveB.raw` (15237 bytes, the run with a
mid-run sentence), `driveC.raw`, `driveG.raw` (scratch cwd), `driveH.raw`,
`driveI.raw`, `driveJ.raw` (timing probe), plus the `.exp` and `.log` pairs.

## What was seen, in order

### The first screen

`frame-drawn @1576ms`, quoted exactly:

```text
cuesheet                                          no project                                           ✓ ready
opencode-binary
──────────────────────────────────────────────────────────────────────────────────────────────────────────────


──────────────────────────────────────────────────────────────────────────────────────────────────────────────
› dis-moi ce que tu veux faire          ⌘K
0 read                                                                                              ? for help
```

It draws fast. The header carries the model, so the surface says which machine
answered before anything has happened, which is the one piece of header that
earns its place.

The cursor is hidden (`?25l`, `hidden=True` in the replay at every frame). It is
drawn as a cell only while text is in the composer. On an empty composer there
is **no visible cursor anywhere on screen**. My hands did not know where to go.

### A plain sentence

Typed `dis-moi ce que tu vois dans ce dossier`, which is not a goal and not a
command. It appeared verbatim in the composer, Enter submitted it, and the
timeline took two rows within about a second:

```text
  you  dis-moi ce que tu vois dans ce dossier
    working in  ✓ /Users/memo/projects/tools/cuesheet
```

**The promise holds.** No phrase router, no "I can't tell which one you mean", no
question handed back. The sentence was recorded and acted on. This is the single
clearest result of the drive.

**But `working in` is wrong.** I launched from
`/var/folders/.../T/opencode/drive`, a throwaway directory with nothing in it.
The row says `/Users/memo/projects/tools/cuesheet`. Launched from
`/Users/memo/projects/tools/stasis` it said the same thing. Launched by running
the slice directly with `tsx` from the throwaway directory, it correctly said
`/private/var/folders/.../drive`.

The cause is one line, `src/surface-cli.ts:75`: the child is spawned with
`cwd: TERMINAL`, so `process.cwd()` inside the app is always the terminal app's
own directory. The scope is therefore the surface's directory and not the
person's. The help overlay promises `✓ where you are decides the project`. Where
you are is discarded before the producer ever sees it.

This is the most consequential thing found, because the row is the surface's
verification affordance. A person who checks it sees a plausible path and has
been told that path is where the work lands.

### The run

Eight steps, about four minutes, and this is the entire visible output:

```text
    working in  ✓ /Users/memo/projects/tools/cuesheet
    work        ? still open after 8 steps
```

`0 read` in the status bar for the whole run. No action row, no tool row, ever.
The header said `◇ working` from submit to about 3 minutes, then `✓ ready`.

Three independent measurements agree on why, and they are not speculation:

- A direct probe of the binary with the same agent config returns
  `"toolCalls":[]` every time, with a plain narration as `text`.
  `cost: 0` on every `step_finish`, as claimed.
- Executing `translateEvent` on a model-text observation returns `null`. The
  model's own words are dropped on the floor, because only an observation
  carrying `data.tool` becomes an entry.
- The prompt says the proposeable tools are
  `none declared in the directives`, because `vocabularyOf` reads a `tools:`
  directive and nothing in the terminal app ever appends one.

So the loop asks a model that has no verbs what it would do, eight times, and the
surface shows nothing, because there was nothing to show. Then it says
`still open after 8 steps`, which is honest. The honesty is not the problem. The
three and a half minutes of a screen that does not change is.

### A second sentence while the run is in flight

At +20s, while the header read `◇ working`, I typed
`attends, montre-moi aussi les tests` and pressed Enter. The composer stayed live
and accepted it. It appeared as a `you` row, and one row appeared under it:

```text
  you  attends, montre-moi aussi les tests
    direction   ◇ changed while working; the run picked it up at step 1
```

**Nothing queued.** No second run started, the composer never became
unavailable, and the sentence was on screen immediately. SW-02's claim holds,
observed rather than argued.

### The direction row

`direction   ◇ changed while working; the run picked it up at step 1`

Read in screen terms: I typed a second sentence, and the surface told me the
direction changed. That is not what happened. My sentence did not change what
the run was doing; it was appended to the log while the run was mid-step, and the
step's record was refused and re-derived. The label says the work changed when
the work did not.

`changed while working` also puts the actor in the wrong place: what changed was
Cuesheet's bookkeeping, mid-inference. And "picked it up at step 1" told me
nothing, because the sentence landed during step 1, so of course the run picked
it up at step 1.

The glyph `◇` is `active`, which is right. The label is the problem.

### No repository in sight

Run by launching the slice directly with `tsx` from the throwaway directory, so
that `process.cwd()` was really the throwaway directory:

```text
cuesheet                                            drive                                            ◇ working

  you  raconte-moi ce que tu vois ici
    working in  ✓ /private/var/folders/9l/jsy6rgt160v3z3vrkqqjhdyh0000gn/T/opencode/drive
```

The header reads `drive`, the basename of a directory, in the place where a
project name belongs. It is honest and it is useless: it is a name I invented by
accident of where I stood. The scratch path works, nothing is asked of me, and
nothing is invented on my behalf beyond a directory name wearing a project's
slot.

## Failures, with the actual text

Two advertised keys do nothing. The composer prints `⌘K` on every frame. Sending
`0x0b` (Ctrl-K, the byte a terminal delivers for that chord) changed the screen
by nothing at all across three separate drives. Sending `0x09` (which is also
Ctrl-I, and which the help overlay advertises as `⌘I for the log`) likewise did
nothing. F5, Ctrl-A: nothing.

There is no error to quote, because there is no failure. The overlay state
`palette` exists in the union in `state.ts:84` and is opened by
`Composer.tsx`, and `App.tsx` has no branch that renders it, so it falls through
to the timeline. Ctrl-I opens `inspect` and the inspect overlay rendered
`nothing has happened yet` in one drive and, in another, did not appear at all
because the log was non-empty but the overlay still fell through.

What works: `?` on an empty composer, `↑`, `esc`, `enter`, `⌃C`, and typing.

## Observations, marked as observation and not as measurement

These are mine, and a machine cannot produce them.

- **I could not tell I could type.** The composer shows `›` and faint text, the
  cursor is hidden, and nothing blinks. I typed anyway because I was told to. I
  would have sat there.
- **Two identical header lines during the run.** `cuesheet  no project  ✓ ready`
  appears, then `cuesheet  cuesheet  ◇ working` below it. At 110 columns the
  replay shows both because the old frame was never cleared, and in the raw
  stream the duplication is real output, not a replay artefact. It reads as a
  rendering fault and it is the first thing I would report as a bug.
- **The run was boring in the exact way the product is not.** Three and a half
  minutes of an unchanging screen. I found myself reading the status bar for
  information, which is the dashboard failure the status bar's own comment says
  it was built to avoid.
- **`⌘K` in the corner is a promise I tried.** It is the only affordance on the
  empty screen, and it does not work.
- **The words are French and consistent.** `dis-moi ce que tu veux faire`,
  `dis-moi ce que tu vois dans ce dossier`, `raconte-moi`, `attends, montre-moi
  aussi les tests`. Nothing on this surface asked me to learn a noun. That is
  the promise and it is met.

## Would I use it tomorrow morning

**No, not yet, and the reason is narrow.**

It broke my attention at `still open after 8 steps`, arriving after three and a
half minutes during which nothing on screen had changed. Not at the wording, not
at the layout, not at the absence of work in the timeline, which I could read as
"it did nothing". At the wait. A person cannot tell a surface that is working
slowly from a surface that has stopped, and this one gave me no way to tell for
180 seconds.

What is beautiful: the plain-sentence path. I typed something that was not a goal
and it was not reinterpreted as one. That is the product, and it works. The
help overlay is four honest lines and needs no vocabulary. And the certainty
colouring is right: `? still open after 8 steps` is grey and marked `?`, not
green, and it did not claim success.

## What remains UNOBSERVED

Not padded. These are the things this drive did not see, and several of them are
the ordinary case rather than the exotic one.

- **Any tool call, ever.** No `read`, `edit`, `test` or `verify` row was drawn in
  any run. Every part of the timeline that exists to show work is untested by
  use.
- **The projects overlay.** Never opened. It needs two or more projects
  defending themselves from one sentence, and I did not construct that.
- **The `evidence` row and a `goal-closed` stop.** Only `budget-exhausted` was
  observed. `entryForStop`'s other two branches are unexercised by a person.
- **A blocked run** (`it could not start:`).
- **The inspect overlay with a real log.** `⌘I` never rendered it. The raw log
  was read from the expect capture, not from the surface.
- **Ctrl-K and the `palette` overlay**, whether dead or merely unreachable.
- **Scrollback.** `VISIBLE` is 16 in `App.tsx`; I never produced a timeline long
  enough to reach the cap, so the trimming behaviour is unobserved.
- **Anything past 180 seconds** on a run, and the 300 s per-inference ceiling in
  `binary-model.ts`.
- **A second sentence typed while idle, after a run has finished.**
- **A run that finds real work in a real repository**, which is the case the
  product exists for and the one I was least able to attempt safely.
- **Resize.** The window was fixed at 110x45 for every drive.
- **Colour.** `pyte` reproduces glyphs and positions, not the 24-bit palette. The
  colours in `theme/tokens.ts` were not seen.
- **`cuesheet chat`**, the diagnostic surface, at all.
- **Any `--auto`-free assertion about cost from inside a run.** `cost: 0` was
  confirmed by direct probe of the binary, not read off the surface, because the
  surface does not display cost.

## Stale claims found, reported rather than corrected

- `docs/installability-audit.md:411` holds
  `a run needs OPENROUTER_API_KEY, no unauthenticated fallback` marked **TENUE**,
  evidenced by the string `there is no local model runtime on this machine`. Both
  halves are now false: MB-01 removed the gate and replaced that sentence. The
  audit row is not edited here.
- `docs/installability-audit.md:413` calls `src/chat.ts` "the default surface".
  A bare `cuesheet` has dispatched to the Ink surface since `2ad1c45`.
- `docs/SURFACE-DOGFOOD.md:204-206` lists `keypress to glyph, 0 ms` under PROVEN.
  This drive measured nothing about latency; a human typing at a terminal is not
  a keystroke-timing harness, and no number here contradicts or supports it.

## Fixes needed, not made

Each is a future slice with its own verification. None was applied.

1. **`src/surface-cli.ts:75` discards the launch directory.** `cwd: TERMINAL`
   means the scope is always the surface's own directory. The fix is to spawn
   with the caller's `cwd`, or to pass it into `main.tsx` as a prop, so the
   `working in` row reports where the person actually is. Verification: a drive
   from two different directories asserting two different `working in` values.
2. **The model has no verbs.** Nothing appends a `tools:` directive, so
   `vocabularyOf` returns empty and the prompt says `none declared in the
   directives`. Either the surface declares the verbs it will accept, or the run
   is not a run. Verification: a live run producing at least one `action` row.
3. **`translateEvent` drops the model's text.** `data.text` on an observation
   returns `null`, so a person who asked a question never sees an answer.
   Verification: a drive where the sentence is answered on screen.
4. **The `direction` row misattributes a bookkeeping event to the work.** It says
   the direction changed when the run's step was refused and re-derived.
   Verification: assert the row's wording against what the rebase actually did.
5. **`palette` is in the overlay union and has no renderer.** `⌘K` is printed on
   every frame. Either render it or stop advertising it.
6. **`⌘I` is advertised in the help overlay and did not work** when sent as
   `0x09`. Worth checking what byte the intended chord actually delivers before
   changing anything.
7. **The header double-draws during a run.** Observed in the raw stream, not only
   in replay.

## Why this file exists

Because the previous record was right that use is the next source of
information, and because the difference between what this drive found and what the
tests found is the whole argument for driving the surface. 591 tests pass. The
plain-sentence promise, the mid-run sentence, the transport and the cost all hold,
and the tests were right about every one of them. What the tests could not see is
that `working in` names a directory nobody is standing in, that the screen is
silent for three and a half minutes, and that the one word a person would reach
for is printed on every frame and does nothing.