# Surface Dogfood

The next source of information is use. Not a milestone, not a design question.

```text
observed:
  1. "on fait quoi ?"     -> "I can't tell which one you mean."   (fixed)
  2. "on fait quoi ?"     -> "Your projects are in ~/projects."    (fixed)
  3. "a toi de me dire"   -> "I don't know that one."             (open)
```

### OBS-1, the first one, on the first run

```text
❯ cuesheet
  cuesheet
  What are we working on?
› on fait quoi ?
  I can't tell which one you mean.
  Give me its name, or its folder.
```

The sentence is not a project reference. It is a question about what to do, and
the slice has exactly one interpretation of every line: it is always trying to
name a project. So a question received a message that presupposes the question
was a failed attempt to name a directory.

This is the same shape as the lie the old chat told, one level up. The chat said
`not a goal` about a stated intention. The slice says `I can't tell which one you
mean` about a line that never claimed to be a project name. Both answer by
asserting what the person meant, and both are wrong, and neither is noticed
because the tone is helpful.

What made it a real observation rather than a feature request: the surface
answered a question that was not asked of it, and the way to avoid that is not to
add a smarter matcher. It is to stop treating every line as the same kind of
thing.

### OBS-2, the fix answered without lying, and was still wrong

After OBS-1 the surface stopped claiming I had been naming a project. It said:

```text
> on fait quoi ?
Your projects are in ~/projects.
Name one and we'll work there.
```

Every sentence is true. It is also a redirect, and the person who asked what we
should work on was handed the question back. "Where are your projects" is not
what was asked, and answering it is a way of not answering.

The surface can read the portfolio. It has 46 projects on disk, knows which are
clean and pushed and which have work in progress. Answering a question about
what to work on with a directory listing is not a limitation, it is declining to
read what was already there.

```text
> on fait quoi ?
5 ready to write.
  29 held, so not listed.

  agent-reality-bench
  dsn-ecart
  factura
  gtm
  fortnite-roblox

agent-reality-bench?
```

This is also the first place the surface pays for the expensive observation, and
here it is worth it. Naming a project needs no evidence beyond a path, which is
why binding costs 1 ms. "What can we work on" is a question about writing, so
the answer has to come from the repositories' real state. Two questions, two
costs, and the cheap one is not the expensive one.

### OBS-3, still open

```text
> a toi de me dire
I don't know that one.
Name a project, or ask me what we're working on.
```

A second attempt at the same question, in different words, is not recognised as a
question. The router has a fixed phrase list, and "c'est toi de me dire" is not
on it. So the answer to a request for a recommendation is "I don't know that
one", which is both unhelpful and technically true.

This one is not fixed. A fixed phrase list is the same class of defect as a
single interpretation of every line, and the fix for that was to ask a router
that understands more than one form. The question is whether a second round of
observations is what shows the router is too narrow, or whether this is the
router being right and the surface needing to understand that a person repeating
a question is still asking it.

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
