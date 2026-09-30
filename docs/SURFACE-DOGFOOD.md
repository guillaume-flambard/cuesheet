# Surface Dogfood

The next source of information is use. Not a milestone, not a design question.

```text
observed:
  none yet
```

## What counts as an observation

A sentence, written after the fact, about something that got in the way. Not a
feature request, not a design idea, not a preference about a colour.

```text
"je ne comprends pas ce qu'il attend de moi"
"ca parle trop"
"je ne vois pas qu'il travaille"
"j'ai du ouvrir cuesheet chat"
"je ne sais pas comment revenir au projet precedent"
"ca me ralentit par rapport a avant"
```

A sentence becomes an observation when it is written down after it happened, and
not before. The difference matters: a prediction about what will be wrong is a
guess, and this repository has already spent sixteen milestones learning that a
confident guess about a machine is usually wrong.

## What an observation does and does not do

It does not admit a primitive. Not even a strong, repeated one. It becomes the
next thing to understand, and understanding it may conclude that no change is
warranted, which is a result and not a failure.

The rule that governs admission is unchanged and is not relaxed here:

> No new core primitive without a real counterexample observed during use.

Five tasks requesting `search_text` is a number. A counterexample is a place where
the system did the wrong thing, and those are different kinds of evidence.

## State of the surface

```text
HUMAN SURFACE V1   committed, validated technically

PROVEN
  cuesheet launches the human surface
  zero diagnostic noise at startup
  keypress to glyph, 0 ms
  project resolution from $HOME
  project binding performs no git observation
  the diagnostic chat is preserved under `cuesheet chat`
  a non-TTY failure is one sentence, not a stack trace
  the entry point is import-safe
  527 tests, 525 pass, 0 fail, 2 skipped

NOT YET PROVEN
  pleasant over long sessions
  beautiful during complex work states
  daily-driver preference
```

The three unproven lines are the point of this file. They are the only things
left to find out, and they are found by working, not by designing.

## Why this file exists

Because the failure mode of a project at this stage is to invent the next
milestone. Sixteen milestones and eight experiments produced a frozen core, and
the natural next move is a seventeenth. The counterexample is that the most
valuable findings in this repository, the ones that changed what the code
believes, arrived as surprises:

```text
a linter's own reason for existing   a chat that said "not a goal"
a capture that could hold a state     the world never had
a receipt that turned out to be       a laundering route, not a completion
a launch that could not be found      whose work existed and was verified
a read that could not have happened   because a real model's length was unknown
```

None of those was proposed first. Each was found by asking what the machine
actually did, and each changed a belief. So the next one will come from the same
place, and until then this file stays empty.
