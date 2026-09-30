# Manual evidence: the staged prompt on a real terminal

Automated tests run the chat with piped stdin, where the prompt is deliberately
not emitted, because a prompt in a pipe is transcript a script reads. The state
in the prompt is therefore the one part of the surface the suite cannot assert
on. It was verified by hand on a pty, and recorded here as **manual evidence**,
which is the honest label: this repository knows the difference between what it
has proved and what a person has only seen.

## The property

> If cuesheet keeps an intention, the user never has to remember it exists.

## Checklist, run on 2026-09-29

Driven through a pty, reading the rendered prompt after each line.

| # | Action | Expected | Observed |
|---|---|---|---|
| 1 | `fix the capability display` | goal staged | `goal` + `scope` printed |
| 2 | wait | prompt carries the goal | `go? fix the capability display>` |
| 3 | `projects` | answered, goal untouched | `free to write` + `held` |
| 4 | wait | prompt still carries the goal | `go? fix the capability display>` |
| 5 | `hey` | social answer, no repetition | greeting, prompt unchanged |
| 6 | `hey` again | short answer, no goal line | `still here.` |
| 7 | `non` | goal consumed, prompt back to plain | `discarded:` + `cuesheet>` |

Steps 3 and 4 are the ones that matter and they passed: an informative line
answers the question and leaves the pending intention visible. Step 5 is the one
that would have failed before, when a greeting answered `still staged` and
repeated a goal the prompt already carried.

## Not covered

- The `ok vas-y` branch ends the session, because approving in this
  environment starts a real agent run. The approval path is covered
  automatically in `test/chat.test.ts`; only the rendered prompt around it is
  not.
- Colour and cursor movement are not asserted, only the prompt text.
