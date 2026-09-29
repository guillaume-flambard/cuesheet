# plugin-opencode

A shadow sensor for the OpenCode runtime, installed at
`~/.config/opencode/plugin/cuesheet-shadow.ts` and registered in
`opencode.jsonc`. This directory holds a copy so the sensor is versioned
somewhere reviewable; the installed file is the live one.

It hooks `chat.message` and evaluates the admission gate at delegation time
against the live skill registry, then appends one NDJSON record to
`~/.local/share/opencode/cuesheet/shadow.ndjson`.

It never blocks. Shadow mode observes what the gate would say; enforcement is
a later decision the shadow measurement has to earn (see
`docs/decisions/ADR-001-measure-before-runtime.md`).

Verdicts: `allowed`, `would_block`, `unverified`. The third is a gate that
could not read the registry at all, and it is never folded into the other two.

Read the counts:

```bash
node src/shadow-report.ts
```

The design mirrors `~/.config/opencode/plugin/valve-shadow.ts`: NDJSON spool,
fail-open, no interpretation in the sensor. Valve records what actually
happened; cuesheet records what the gate would have said. The disagreement
between the two spools is the measurement.
