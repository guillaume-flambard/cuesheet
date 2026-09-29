import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

// CUESHEET shadow sensor. Pure sensor, same discipline as valve-shadow.
//
// It evaluates the admission gate at delegation time and records the verdict
// as NDJSON. It never blocks: shadow mode observes what the gate would say,
// it does not enforce it. Enforcement is a later decision that the shadow
// measurement has to earn (cuesheet ADR-001).
//
// Why in-process import rather than a subprocess: cuesheet's core is pure
// TypeScript with zero dependencies and no native addon, so it is safe to
// load here. The valve plugin refuses to load valve's store for the opposite
// reason: that store is a native addon. If the cuesheet core cannot be
// loaded, the verdict is `unverified`, which is a first-class outcome and
// never collapses into allow or deny.
//
// The sensor resolves against a registry snapshot taken at message time. That
// is the point of shadow mode: a skill created mid-session is visible to the
// next evaluation, which is the property the historical replay could never
// see because it always evaluated against a registry that had since healed.
//
// Fail-open like valve-shadow: a lost observation is a gap in the dataset, a
// thrown error inside a hook is a broken session. Every path below returns a
// record or nothing; nothing throws.

const SPOOL_DIR =
  process.env["CUESHEET_SPOOL_DIR"] ?? "/Users/memo/.local/share/opencode/cuesheet"
const CUESHEET_ROOT =
  process.env["CUESHEET_ROOT"] ?? "/Users/memo/projects/tools/cuesheet"
const SKILL_ROOTS = ["/Users/memo/.agents/skills"]
const MAX_FIELD = 2000

let enabled = true
let spoolPath = ""
try {
  mkdirSync(SPOOL_DIR, { recursive: true })
  spoolPath = join(SPOOL_DIR, "shadow.ndjson")
} catch {
  enabled = false
}

const write = (record: Record<string, unknown>) => {
  if (!enabled) return
  try {
    appendFileSync(spoolPath, JSON.stringify(record) + "\n", "utf8")
  } catch {
    // Deliberately silent. See the header.
  }
}

const base = (kind: string, sessionID: string) => ({
  v: 1 as const,
  kind,
  sessionID,
  ts: Date.now(),
})

type Extractor = (text: string) => {
  requirements: Array<{ kind: string; name: string }>
  matches: Array<{ name: string; directive: boolean }>
}

// Loaded once per process. If it fails, every evaluation degrades to
// unverified with a reason, which the report counts honestly.
let core: null | {
  extract: Extractor
  resolve: (
    requirements: Array<{ kind: string; name: string }>,
    available: Array<{ kind: string; name: string; version: string; source: string }>,
  ) => { verdict: "ready" | "blocked"; registryUnverified: boolean }
  registry: () => Array<{ kind: string; name: string; version: string; source: string }>
} = null
let loadError = ""

try {
  // Dynamic import so a missing or broken core is a degrade, not a crash.
  const capability = await import(`${CUESHEET_ROOT}/src/core/capability.ts`)
  const extract = await import(`${CUESHEET_ROOT}/src/core/extract.ts`)
  const skills = await import(`${CUESHEET_ROOT}/src/adapters/skills.ts`)
  const { SkillsAdapter } = skills as {
    SkillsAdapter: new (o: { roots: string[] }) => { listCapabilities(): Array<{ kind: string; name: string; version: string; source: string }> }
  }
  const adapter = new SkillsAdapter({ roots: SKILL_ROOTS })
  core = {
    extract: (extract as { extractSkillRequirements: Extractor }).extractSkillRequirements,
    resolve: (requirements, available) => {
      const r = (capability as {
        resolveCapabilities: (
          a: never, b: never, c: never,
        ) => { verdict: "ready" | "blocked"; registryUnverified: boolean }
      }).resolveCapabilities(
        requirements as never,
        available as never,
        { now: Date.now() },
      )
      return { verdict: r.verdict, registryUnverified: r.registryUnverified }
    },
    registry: () => adapter.listCapabilities(),
  }
} catch (error) {
  loadError = error instanceof Error ? error.message : String(error)
}

export default (async () => {
  return {
    // A user message is the delegation boundary: it is what was asked, and it
    // is the moment an admission gate would run. Every message is evaluated,
    // including ones with no skill requirements, because the denominator of
    // the shadow measurement is messages seen, not messages that mentioned
    // skills.
    "chat.message": async (input, output) => {
      const first = output.parts?.[0]
      const text = first && first.type === "text" ? first.text : ""

      if (!core) {
        write({
          ...base("delegation_evaluated", input.sessionID),
          agent: input.agent,
          requirements: [],
          matches: [],
          verdict: "unverified",
          missing: [],
          registrySize: 0,
          registryUnverified: true,
          reason: `core not loadable: ${loadError.slice(0, 200)}`,
        })
        return
      }

      try {
        const extraction = core.extract(text)
        const available = core.registry()
        const registryUnverified =
          available.length === 0 ||
          available.every((c) => c.version === "unverified")

        const resolution = core.resolve(extraction.requirements, available)
        const missing = resolution.verdict === "blocked"
          ? extraction.requirements
              .filter((r) => !available.some((c) => c.kind === r.kind && c.name === r.name))
              .map((r) => r.name)
          : []

        write({
          ...base("delegation_evaluated", input.sessionID),
          agent: input.agent,
          requirements: extraction.requirements,
          matches: extraction.matches.map((m) => ({ name: m.name, directive: m.directive })),
          verdict: extraction.requirements.length === 0
            ? "allowed"
            : resolution.verdict === "ready"
              ? "allowed"
              : "would_block",
          missing,
          registrySize: available.length,
          registryUnverified,
        })
      } catch (error) {
        write({
          ...base("delegation_evaluated", input.sessionID),
          agent: input.agent,
          requirements: [],
          matches: [],
          verdict: "unverified",
          missing: [],
          registrySize: 0,
          registryUnverified: true,
          reason: `evaluation failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
        })
      }
    },

    dispose: async () => {
      // Nothing retained between messages: every evaluation reads the live
      // registry again, so there is no cache to invalidate and no state that
      // could go stale.
    },
  }
}) satisfies Plugin
