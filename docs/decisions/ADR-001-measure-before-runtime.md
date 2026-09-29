# ADR-001: measure before runtime

## Decision

Measure before building a runtime. A runtime is not a goal; it is a possible
conclusion of the benchmark.

## Context

Three agents were briefed today to load the `github-readme` skill, and none
could see it, because the skill list is snapshotted when a session starts, so a
skill created mid-session is invisible to every agent already running. The
failure mode was worse than silent: the agents silently degraded the brief into
their own specification and never reported it as a failed requirement.

Investigation of the landscape (2026-09-29) established a separation this
project had been blurring:

- **Already standardized or solved elsewhere**, which must be implemented
  correctly but cannot be a thesis: MCP tool list-change notifications
  (`tools.listChanged`, `notifications/tools/list_changed`), Claude Code
  v2.1.152 `/reload-skills` and a `SessionStart` hook returning
  `reloadSkills: true`, runtime message-injection middleware (Microsoft Agent
  Framework 1.11.0), persisted interrupts (LangGraph `interrupt()` +
  checkpointer), and SDK guardrails (OpenAI Agents SDK). These are conformance
  targets, not research problems.
- **Still open**, measured but unsolved: SkillsBench (Feb 2026) reports that
  harnesses differ in whether an agent that acknowledges a skill's content
  actually invokes it; Harness-Bench (May 2026) reports recurring
  "execution-alignment failures, where plausible reasoning becomes decoupled
  from tool feedback, workspace state, evidence, or verifiable output
  contracts", over 5194 trajectories and 106 tasks.
- **Already measured negative**: SkillsBench found that self-generated skills
  provide no reliable average benefit (-1.3pp). Automatically converting
  repeated trajectories into new skills is therefore a research hypothesis
  with a negative prior, not a roadmap item.

The remaining open problem is the alignment between what an agent knows, what
the environment shows, and what it does.

## Consequences

- **No new runtime, no daemon, no SwiftUI app, no Rust rewrite is admitted**
  until measurement demonstrates repeated alignment failures that existing
  primitives cannot address.
- Work proceeds in an order where evidence precedes machinery:
  `resolveCapabilities()` in this repository, a conformance suite, then a
  measure-first benchmark, then the runtime decision.
- Self-improvement is demoted from a planned feature to a research hypothesis
  with a negative prior.
- The conformance and alignment suites never share a results language, so a
  conformance failure can never be reported as a research finding.

## Immediate work

1. `resolveCapabilities()` in this repository.
2. A conformance suite in a separate repository, so this one keeps its
   admission rule and zero dependencies.
3. A KNOW/SEE/DO alignment benchmark: does an agent's knowledge, its
   observation of the world, and its action keep describing the same reality.
4. The runtime decision, last.

## Reversal condition

A measured, reproducible alignment failure exists that existing harnesses and
primitives cannot address without architectural compromise. Not "we found a
failure": many failures are fixable with what already exists. Only a failure
whose remedy requires a primitive no current harness supplies justifies a
runtime.
