# Delegation requirements

The declaration format for the capabilities a work packet needs, and the gate
that refuses to spawn on them. The decision behind this lives in
[ADR-001](decisions/ADR-001-measure-before-runtime.md): capability resolution
happens at delegation time against the live registry, and a blocked resolution
must name the missing capability and the alternatives. A library that can
refuse is not a mechanism that refuses; the gate exists so the refusal runs
even when nobody remembers to ask.

## The declaration

A requirements file is JSON with one key:

```json
{
  "requirements": [
    { "kind": "skill", "name": "github-readme" },
    { "kind": "tool", "name": "rg" }
  ]
}
```

Rules, each with a reason:

- `kind` and `name` are non-empty strings, matched exactly against the
  registry. No trimming, no case folding, no fuzzy matching. A typo must
  block, not best-effort resolve into a weaker brief.
- Kinds never cross. Requiring a `tool` never resolves against a `skill`
  that happens to share the name.
- Extra keys on the declaration or on a requirement are ignored, so a brief
  can carry its own context without asking permission.
- A bare top-level array is rejected, with the correct shape named in the
  error. A format whose meaning depends on guessing what the writer meant is
  how a brief degrades silently.
- An empty `requirements` array is valid and trivially ready. Declaring
  nothing is a statement, not an error.

## Where it lives in the flow

The launch prompt (`docs/launch-prompt.md`) hands each worker a brief with a
resolved absolute path. The requirements file belongs in that same brief,
named alongside the path, and the delegator runs the gate before spawning:

```bash
node src/cli.ts --requirements brief.requirements.json --skill-root ~/.agents/skills
```

The gate resolves against the live skill roots at that moment, which is the
whole point: a skill created after a runtime session started is invisible to
that session, so the check must run at the last moment before the spawn, not
at process start.

## The verdict

The gate prints one line per requirement, then the verdict:

```text
requirements: brief.requirements.json (2 declared, 1 skill root)
ok      skill "github-readme" 1a2b3c4d5e6f <skills-root>/github-readme
BLOCKED tool "rg": required tool "rg" is not in the registry; no tool capability is registered at all
conformance verdict: blocked (1 of 2 resolved): do not spawn
```

The verdict is conformance language on purpose: binary, per-requirement,
evidence attached. The alignment and research suites (ADR-001) must never
share this results language, so a conformance refusal can never be reported
as a research finding.

When the registry itself could not be read, every blocked line says so
explicitly: absence here is not evidence the requirement is unsatisfiable
everywhere. An unreadable root means "cannot tell", never "does not exist".

## Exit codes

| code | meaning |
|---|---|
| 0 | ready: every declared requirement resolved |
| 1 | blocked: do not spawn. A normal refusal, not a crash |
| 2 | broken invocation: bad flag, unreadable file, malformed declaration |

## Deliberately not here

No version pinning in the declaration, no hot-reload behaviour, no cross-kind
resolution. Pinning a capability's content identity and verifying it later is
future work with its own tests. Hot-reload behaviour belongs to the
conformance suite (ADR-001), not to this core.
