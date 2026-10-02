# CUESHEET NORTH STAR

> **NORTH STAR IS NOT THE BACKLOG.**
>
> This document preserves the long-term product vision and architectural
> principles of Cuesheet. It is not the active backlog, it is not permission to
> implement every idea described here, and it is not evidence that a capability
> exists. The repository remains authoritative about what is implemented, tested
> and proven. The active roadmap remains authoritative about what should be built
> next.

This document answers one question:

> What is Cuesheet ultimately trying to become, and which important ideas must
> never be accidentally forgotten while implementing it incrementally?

The machine-readable counterpart is `state.json`, array `concepts`. Every concept
there is `FROZEN`, carries no requirement and no acceptance criterion, and
therefore nothing can be claimed from it. When the two disagree, `state.json` is
authoritative about what is frozen; this file is authoritative about the
reasoning, which does not belong in a JSON field.

## Status of this document

Every capability described below must remain classified as one of:

- VISION
- SPECIFIED
- IMPLEMENTING
- VERIFIED
- HUMAN-VERIFIED
- DEFERRED
- REJECTED

Never silently turn VISION into active scope.
Never describe VISION as implemented.

---

# 1. The fundamental idea

Cuesheet is a universal execution harness between human intent and computational
work.

It should eventually remove the artificial boundaries between:

- chat;
- research;
- planning;
- specification;
- coding;
- artifact creation;
- testing;
- review;
- computer interaction;
- automation;
- agents.

The human expresses intent.

Cuesheet determines what kind of work that intent requires.

The human should not need to think:

> "Should I open ChatGPT, Claude Code, Codex, a terminal, an IDE, a research tool, a document editor or an agent?"

The interaction starts with intent.

Cuesheet determines the execution environment.

Conceptually:

```text
human intent
→ understand
→ determine required mode/capabilities
→ plan if necessary
→ execute
→ observe
→ verify
→ adapt
→ return only what matters to the human
```

---

# 2. There is no mandatory repository

Cuesheet must not assume that every interaction is software development.

A conversation may begin without:

- a Git repository;
- a project;
- files;
- code;
- a workspace.

Examples:

```text
"Help me think through this product."
"Research this market."
"Create a document."
"Compare these approaches."
"Build a prototype."
"Now turn that prototype into a repository."
```

The environment should emerge from the work.

Possible evolution:

```text
conversation
→ research
→ concept
→ specification
→ artifact
→ project
→ repository
→ implementation
```

without forcing the human to restart in another product or mode.

---

# 3. No artificial Chat / Plan / Build modes

Cuesheet should understand the current phase from intent and state.

Internally it may use explicit execution states.

Externally the human should not normally need to select:

```text
CHAT
PLAN
BUILD
RESEARCH
```

The harness determines whether an input requires:

- answering;
- asking;
- researching;
- planning;
- editing;
- executing;
- testing;
- generating an artifact;
- waiting;
- delegating;
- escalating to the human.

Mode is an implementation concern.

Intent is the user interface.

---

# 4. No message queue as the human interaction model

A fundamental Cuesheet invariant:

**The human must never become blocked by an agent currently working.**

While work is running, the human may continue speaking.

New input enters shared live context immediately.

There is no conceptual:

```text
message
→ queued
→ wait for current answer
→ process later
```

Instead:

```text
current execution
        │
human input
        ↓
shared context changes
        ↓
reinterpretation
        ↓
impact analysis
        ↓
execution graph adapts
```

Journey 003 already demonstrates part of this principle.

The long-term requirement is semantic adaptation, not merely accepting keyboard input.

---

# 5. Live semantic reinterpretation

When new human intent arrives during execution, Cuesheet determines its meaning relative to current work.

Possible classifications:

- clarification;
- additional constraint;
- correction;
- cancellation;
- reprioritization;
- independent request;
- replacement objective;
- information;
- approval;
- rejection.

Cuesheet then determines what existing work is affected.

Example:

Current objective:

```text
"Move persistence to PostgreSQL."
```

Workers:

```text
A: schema
B: PostgreSQL adapter
C: generic persistence tests
```

Human:

```text
"Actually keep SQLite."
```

Correct response:

```text
A → inspect impact
B → invalidate/cancel
C → preserve if still valid
```

Not:

```text
restart everything.
```

Not:

```text
ignore the message.
```

Not:

```text
wait until all workers finish.
```

The invariant is:

**invalidate only what the new information invalidates.**

Preserve unaffected work and evidence.

---

# 6. Shared live context

Agents must not behave as independent chats.

There is one evolving world state.

It contains, conceptually:

- current human intent;
- objectives;
- constraints;
- decisions;
- specifications;
- plans;
- execution state;
- evidence;
- memories;
- available capabilities;
- resources;
- permissions;
- unresolved questions.

Workers receive projections of this state appropriate to their task.

They do not each create their own independent interpretation of reality.

---

# 7. Context is not a giant prompt

Cuesheet must not solve shared context by repeatedly injecting everything.

Context should be compiled.

Sources include:

- current intent;
- relevant conversation;
- project state;
- specifications;
- durable memory;
- execution history;
- relevant files;
- relevant research;
- skills;
- evidence;
- policies.

For each inference:

```text
world state
→ relevance
→ authority
→ freshness
→ budget
→ context frame
```

Important information omitted for budget reasons must remain retrievable.

Compression must not silently become authority.

---

# 8. Memory is structured and sourced

Memory is not "the model remembers".

Important durable knowledge should be represented explicitly.

A memory should be able to answer:

- what is known?
- who said it?
- where did it come from?
- when?
- is it still valid?
- what does it apply to?
- has it been superseded?
- is it fact, preference, decision, evidence or inference?

Human corrections have higher authority than model inference.

Contradictions must remain visible until reconciled.

---

# 9. Cuesheet thinks before asking the human

Before asking Guillaume a question, Cuesheet should attempt to resolve it using:

- repository evidence;
- project specifications;
- memory;
- current state;
- tests;
- documentation;
- web research;
- reversible experimentation;
- independent verification.

This is the Think-for-Human principle.

The harness should not turn the human into a router for ordinary engineering decisions.

Ask when human judgment is genuinely required.

---

# 10. Web-first when external truth matters

If a decision depends on current external information and local evidence is insufficient:

research first.

Prefer authoritative sources:

- official documentation;
- specifications;
- upstream repositories;
- primary research;
- release notes.

Do not ask the human something that reliable research can answer.

Do not browse unnecessarily when local authoritative evidence already resolves the question.

---

# 11. Holistic project understanding

Before substantial implementation, Cuesheet should understand enough of the whole affected system to avoid locally correct but globally wrong changes.

The sequence is:

```text
goal
→ understand relevant system
→ identify invariants
→ determine affected surfaces
→ specification
→ executable tasks
→ implementation
→ verification
→ reconciliation
```

This does not mean producing huge documents before every edit.

It means that implementation must belong to a coherent model of the project.

---

# 12. Specifications are living contracts

Specs describe behavior and invariants.

They are not decorative documentation.

A spec should exist when behavior must survive across:

- multiple files;
- agents;
- sessions;
- implementations;
- refactors.

Implementation evidence may reveal that a spec is wrong or incomplete.

Then:

```text
observation
→ reconcile specification
→ reconcile plan
→ continue
```

Never silently diverge implementation from normative intent.

---

# 13. TODO completion means proven completion

A task is not complete because code was written.

Correct lifecycle:

```text
TODO
→ implementation
→ verification
→ evidence
→ DONE
```

If verification is impossible automatically:

```text
TODO
→ implementation
→ machine preparation
→ HUMAN_REQUIRED
```

Cuesheet must never claim project completion merely because all code-generating workers stopped.

---

# 14. Evidence is first-class

Important claims should be backed by evidence.

Examples:

- test result;
- compiler result;
- runtime observation;
- screenshot;
- diff;
- benchmark;
- human observation;
- external source.

Distinguish:

```text
PLANNED
RUNNING
OBSERVED
VERIFIED
HUMAN_VERIFIED
FAILED
BLOCKED
UNKNOWN
```

A model saying "done" is not evidence.

---

# 15. Failure is useful information

A failed attempt is not discarded.

Journey 004 demonstrates the beginning of this principle.

The general loop is:

```text
attempt
→ observation
→ independent verification
→ failure
→ preserve evidence
→ diagnose
→ revise
→ retry
```

Cuesheet should learn from the actual verifier output, not rewrite history into a clean success narrative.

---

# 16. Independent verification

The executor must not be the sole verifier of its own work.

Prefer objective mechanisms:

- compiler;
- tests;
- runtime checks;
- integration tests;
- visual verification;
- policy checks;
- independent model review where appropriate.

Model self-confidence has no verification authority.

---

# 17. Verification should be selected from the change

Cuesheet should determine what evidence is necessary based on what changed.

Examples:

```text
TypeScript      → typecheck + tests
UI              → build + render + interaction verification
API             → contract + integration tests
public command  → invoke exact public command
agent orchestration → real execution journey
security boundary   → adversarial tests
```

The verification graph should be proportional to risk.

---

# 18. Dynamic agent graph

Cuesheet should not have a fixed number of agents.

The number and topology of workers should eventually be determined by the work.

Inputs may include:

- task decomposition;
- dependency graph;
- parallelizability;
- expected duration;
- model availability;
- resource availability;
- cost;
- risk;
- overlapping files;
- required specializations.

Possible outputs:

```text
one worker
two parallel workers
research + implementation
implementation + independent review
multiple experiments
sequential execution
```

No arbitrary "always spawn N agents".

---

# 19. Agents have roles, not personalities

Workers should be created because a bounded responsibility exists.

Examples:

- researcher;
- implementer;
- verifier;
- reviewer;
- migration worker;
- UI worker.

Their role determines:

- context;
- skills;
- model;
- tools;
- permissions;
- resource allocation;
- expected output.

Do not create theatrical agents merely to simulate a team.

---

# 20. Shared agent intelligence

Workers should be able to benefit from other workers' discoveries without becoming tightly coupled.

A useful contribution enters shared state.

Other affected workers may receive the new information.

Conceptually:

```text
Worker A discovers invariant
        ↓
shared evidence
        ↓
impact analysis
        ↓
Worker B receives relevant update
```

This is not workers chatting endlessly with each other.

It is shared world-state propagation.

---

# 21. Agent topology can change while running

A plan is not immutable.

During execution Cuesheet may determine:

- one worker is enough;
- a second worker would help;
- an independent verifier is needed;
- two branches should merge;
- one worker should be cancelled;
- work should become sequential because of conflicts.

The execution graph evolves from evidence.

---

# 22. Multi-agent must degrade gracefully

Multi-agent support is a capability.

It must never be assumed.

If sub-agent spawning is unavailable:

```text
desired parallel graph
→ capability check
→ unavailable
→ preserve dependency graph
→ execute sequentially where semantics permit
```

Never fake parallel agents.

Never block useful work merely because the preferred orchestration primitive is unavailable.

---

# 23. Dynamic skills

Skills should not be frozen at process startup.

Cuesheet should eventually support:

- discovery;
- installation;
- refresh;
- version changes;
- capability changes;
- removal.

When protocols provide capability-change notifications such as MCP `list_changed`, Cuesheet should be capable of reacting without restarting the entire harness.

Skills should be selected by relevance.

Do not inject all skills into all agents.

---

# 24. Model independence

Cuesheet is not built around one model provider.

Models are execution resources.

Possible providers include:

- OpenAI;
- Anthropic;
- OpenRouter;
- local models;
- future providers.

The harness owns:

- model selection;
- routing;
- fallback;
- evidence;
- budget;
- provider capabilities.

No provider owns the Cuesheet architecture.

---

# 25. Hot model switching

Models may change during a session or execution.

A model switch must not imply:

- losing project state;
- restarting conversation;
- losing memory;
- recreating plans.

State belongs to Cuesheet.

The model is a worker over that state.

---

# 26. Empirical model routing

Eventually Cuesheet should learn which models perform well for which work.

Record observations such as:

```text
task type
model
context size
latency
tokens
cost
attempts
verification result
```

Over time:

```text
historical evidence
→ routing decision
```

Example:

```text
"Model X performs UI edits cheaply but fails architecture tasks."
```

Routing should become empirical.

Never invent performance statistics.

---

# 27. Cost-aware execution

Cuesheet should consider monetary and token cost.

Possible constraints:

- maximum budget;
- preferred free models;
- premium model only for hard nodes;
- local model for cheap classification;
- expensive independent review only for high-risk changes.

Cost is one scheduling dimension, not the only one.

---

# 28. Time-aware execution

The human may eventually express:

```text
"Do the best possible job."
"I need something usable in ten minutes."
"Run overnight."
```

Time budget should affect execution strategy.

Possible consequences:

- number of workers;
- model selection;
- depth of research;
- verification depth;
- parallelism.

Do not pretend duration can be predicted precisely before measurements exist.

Unknown estimates remain unknown.

---

# 29. Quality-aware execution

Cuesheet should optimize for verified outcome, not raw speed.

The scheduler may trade:

```text
cost
vs
latency
vs
quality
vs
risk
```

according to objective.

A security migration and a CSS typo should not receive identical execution plans.

---

# 30. Machine-aware scheduling

The scheduler should understand the machine it runs on.

Potential resources:

- CPU;
- RAM;
- GPU;
- disk;
- thermal/energy constraints;
- network;
- available runtimes.

Example:

```text
Mac has 16 GB RAM.
```

Cuesheet should not blindly spawn enough local agents/models to exhaust it.

Resource constraints become part of worker admission.

---

# 31. Local resource broker

Before distributed execution, Cuesheet should eventually manage one machine intelligently.

Conceptually:

```text
Mac
│
├ CPU
├ RAM
├ GPU
├ local models
├ containers
└ processes
       ↓
Resource Broker
       ↓
worker placement
```

The broker determines what can safely run concurrently.

This should be evidence-based.

---

# 32. Local-first execution

When appropriate:

local resources first.

Reasons may include:

- privacy;
- latency;
- cost;
- offline capability;
- available compute.

But "local first" is not ideological.

A cloud model may be preferable when it materially improves the result.

Cuesheet chooses according to policy and objective.

---

# 33. Resource mesh

Long-term, multiple machines may contribute resources to one Cuesheet execution fabric.

Example:

```text
Team
│
├ MacBook A
│   ├ 4 GB allocatable RAM
│   └ CPU
│
├ MacBook B
│   ├ 8 GB allocatable RAM
│   └ GPU
│
└ workstation
    └ large GPU

          ↓

Cuesheet Resource Mesh

          ↓

worker placement
```

A machine contributes only resources explicitly permitted by its owner.

---

# 34. Peer-to-peer team compute

The resource mesh should eventually be able to operate peer-to-peer where appropriate.

A team often owns significant idle compute.

Instead of immediately requiring centralized infrastructure:

```text
team machines
→ advertise bounded resources
→ trusted resource mesh
→ workers distributed according to capabilities
```

Potentially:

```text
Mac A runs research/local inference.
Mac B runs build/tests.
GPU workstation runs heavy local model.
```

The objective is not cryptocurrency-style distributed computing.

The objective is:

**turn unused trusted team compute into useful agent capacity.**

---

# 35. Resource contribution is bounded

A machine never gives Cuesheet unlimited control.

Owner policy may specify:

```text
max RAM
max CPU
GPU allowed
working hours
battery constraints
allowed repositories
allowed secrets
network access
container-only execution
```

Every remote worker executes under explicit policy.

---

# 36. Resource trust and data locality

Distributed compute introduces trust boundaries.

Cuesheet must eventually understand:

- which machine may see which source;
- which worker may receive secrets;
- whether code may leave the local machine;
- tenant/project isolation;
- encryption;
- authentication;
- revocation;
- audit trail.

A free GPU is not useful if using it violates data policy.

---

# 37. Cloud is another resource provider

The same abstraction can eventually include:

- local machine;
- teammate machine;
- dedicated server;
- GPU workstation;
- cloud container;
- remote GPU;
- hosted model.

Conceptually:

```text
Execution Fabric
│
├ local
├ LAN/P2P
├ team infrastructure
└ cloud
```

Workers should care about capabilities and policy, not infrastructure branding.

---

# 38. Cuesheet should understand available physical capacity

Before spawning workers, Cuesheet may eventually evaluate:

```text
available RAM
available CPU
GPU availability
current load
model memory requirements
container overhead
expected task resource use
```

Then decide:

```text
how many workers?
where?
which models?
parallel or sequential?
```

This connects agent orchestration to real hardware.

---

# 39. Adaptive scheduler

Long-term scheduler inputs:

```text
goal

dependency graph

task complexity

parallelizability

quality target

time budget

token budget

monetary budget

models

skills

CPU

RAM

GPU

machines

network

security policy

historical performance
```

Output:

```text
an execution topology.
```

The topology is not static.

Evidence may cause rescheduling.

---

# 40. Scheduling begins simple

Do NOT implement the grand scheduler immediately.

Evolution should be evidence-driven.

Possible stages:

```text
1. explicit bounded rules;
2. measured worker admission;
3. historical execution metrics;
4. simple heuristics;
5. empirical routing;
6. adaptive scheduling;
7. distributed placement.
```

Do not build a speculative optimizer before enough measurements exist.

---

# 41. Persistent execution

Cuesheet work may outlive:

- one model call;
- one terminal;
- one process;
- one application launch;
- one machine session.

Execution state must therefore be durable.

---

# Appendix A. The branch overview

```text
Cuesheet
│
├── Intent understanding
│   ├── chat
│   ├── research
│   ├── plan
│   ├── build
│   └── artifact
│
├── Live Context
│   ├── no message queue
│   ├── reinterpret while running
│   ├── semantic invalidation
│   └── preserve unaffected work
│
├── Intelligence
│   ├── model routing
│   ├── skills
│   ├── memory
│   ├── Think-for-Human
│   └── evidence-based decisions
│
├── Agent Graph
│   ├── dynamic worker count
│   ├── dependencies
│   ├── specialization
│   ├── shared state
│   └── independent verification
│
├── Scheduler
│   ├── quality
│   ├── latency
│   ├── token cost
│   ├── monetary cost
│   ├── RAM
│   ├── CPU
│   └── GPU
│
├── Execution
│   ├── worktrees
│   ├── capsules
│   ├── recovery
│   ├── composition
│   └── verification
│
└── Resource Fabric
    ├── one Mac
    ├── local models
    ├── local GPU
    ├── team Macs
    ├── P2P resources
    └── remote GPU/cloud
```

---

# Appendix B. Reconciliation record, 2026-10-02

This document was reconciled against the repository rather than assumed.

Verified absent as documents before this file was written: `P2P`,
`peer-to-peer`, `resource mesh`, `resource broker`, `adaptive scheduler`,
`time budget`, `token budget`. The English terms returned nothing anywhere under
`docs/`, `src/` or `apps/`.

What already is corpus, and is therefore pointed at rather than repeated here:
the intent routes and the no-mode rule (`src/core/intent.ts`, `01-OBJECTIVES.md`),
the live context mechanism (`test/mid-run-directive.test.ts`, Journey 003), the
state and work graphs (`STATE-GRAPH.md`, `WORK-GRAPH.md`), the capsule and
worktree isolation (`WORKTREE-BUILD.md`), the provider boundary
(`07-PROVIDERS.md`), the capability model (`src/core/capability.ts`), and the
runtime capability probe (`apps/terminal/src/producer/capabilities.ts`).

What was frozen at the same time into `state.json`, array `concepts`, and thus
made machine-readable: twenty entries, all `FROZEN`, none carrying a requirement
or an acceptance criterion. `elastic-workforce` was extended rather than
duplicated, because it already names the scheduler; `adaptive-budget` and
`machine-awareness` were added because they were genuinely absent.

Nothing in this document or that array authorises implementation. The active
roadmap decides that.
