# Surface Dogfood

The next source of information is use. Not a milestone, not a design question.

```text
observed:
  1. "on fait quoi ?"   -> "I can't tell which one you mean."    (fixed)
  2. "on fait quoi ?"   -> "Your projects are in ~/projects."     (fixed)
  3. "je sais pas"      -> "I don't know that one."              (fixed)
  4. "laisse tomber"    -> "I don't know that one."              (fixed)
  5. "montre-moi"       -> "I don't know that one."              (fixed)
  6. "aide"             -> "I don't know that one."              (fixed)
  7. "a toi de me dire" -> "I don't know that one."              (open)
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

### OBS-3, five answers, one message, and the surface was a form

The third observation is the one that reached the structure. It is worth
preserving in full because the two before it were both misread as wording.

```text
> je sais pas
I don't know that one.
Name a project, or ask me what we're working on.
```

Five different answers to the same question all received the same reply:

```text
"je sais pas"     -> I don't know that one.
"aucun"           -> I don't know that one.
"laisse tomber"   -> I don't know that one.
"montre-moi"      -> I don't know that one.
"aide"            -> I don't know that one.
```

Every one of those is a valid human answer. Every one was handed to the project
binder as if it were a directory path, because the surface had exactly one
interpretation of every line. A person who did not know the answer was told that
Cuesheet did not either, and then told what to type. That is not an assistant
with a gap in it, it is a form with a text field.

The rule this produced, and the one the tests now hold:

> A clarification never constrains the shape of the answer.

A person may answer "which project" with a project, with not knowing, with
asking to stop, with asking to see the list, or with something else entirely.
The question does not get to decide which of those is grammatical.

The fix is a small closed layer in front of the binder, five intents because five
were observed:

```text
PROJECT_CANDIDATE   the default, and the only one that reaches the binder
UNCERTAINTY         "je sais pas", "aucun"
CANCEL              "laisse tomber"
SHOW_ME             "montre-moi"
HELP                "aide"
```

No model, and no claim that a phrase list over French is the right general
answer. A sixth intent is not admitted until a sixth is observed.

### What the other terminal does with the same moment

The developer machine has a second terminal, and it was worth asking what it does
with the same line rather than guessing:

```text
> je sais pas
Qu'est-ce que tu veux faire ou savoir ?

> laisse tomber
D'accord, j'arrête. Dis-moi quand tu veux relancer.

> montre-moi tes projets
[the portfolio, with the free and held counts]
```

It asks a question, it accepts a cancellation, and it shows the list on request.
It never says "I don't know that one", because that is a claim about the sentence
rather than an offer of what comes next.

### OBS-7, still open

```text
> a toi de me dire
I don't know that one.
```

The same request as OBS-3, in different words, and the phrase list does not
contain it. This is now the second observation to show that a list of observed
phrases is a list, not an understanding, so the next move is not a longer list. It
is either a router that can be asked what a line is trying to do, or an admission
that a person repeating a question is still asking it and the surface should
carry the conversation rather than the sentence.

Recorded, not fixed, because one more list entry would make the failure rarer
without making it different.

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
