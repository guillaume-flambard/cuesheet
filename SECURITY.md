# Security policy

## The threat model is narrow, and it is worth stating

cuesheet reads local Git state and prints a verdict about which directories a
writer may touch. It has no dependencies, performs no network I/O, and reads
nothing outside the roots you pass to it.

That means the interesting failures are not remote code execution. They are
wrong verdicts.

A false `available` is the expensive one. It tells a second writer that a
directory is free when a live session is already using it, and the result is two
writers corrupting work that looks fine until it does not. The default is
deliberately conservative for that reason, and any change that makes the
verdict more permissive needs evidence from a real incident, not a preference.

## Reporting a vulnerability

Report it privately, not as a public issue.

    https://github.com/guillaume-flambard/cuesheet/security/advisories/new

If private reporting is unavailable to you, open a regular issue that describes
the class of problem and the reproduction, without the exploit detail, and say
that you would rather send the detail privately.

Please include:

- the inputs you passed, with any path redacted to its shape;
- the verdict you got and the verdict you expected;
- why you believe the expected verdict is correct.

## What is not a vulnerability in this project

- A verdict that is conservative when the real state was genuinely ambiguous. A
  long single step and an abandoned session are not distinguishable from the
  outside, and the project treats them as held on purpose.
- A path outside the roots you passed being read. The roots are the boundary.
- The absence of locking. The window is an inference, not a lock, and the
  README says so.

## Supported versions

Only `main`, at 0.x. There is no release line to backport to.
