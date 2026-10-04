# Cuesheet design direction

Status: recovered product constraints; original visual references still missing.
The owner rejected the current Open Design terminal prototype on 2026-10-03.
This document does not claim to reproduce or replace the earlier generated images.

## Sources and precedence

Canonical visual and interaction direction supplied by the owner:
`MASTER-DESIGN-DIRECTION.source.txt` (attachment a44fb9ff, 2026-10-03).
This source supersedes conflicting earlier prototype briefs. One flowing
terminal-native surface; compact meaningful work tree; workers as inline
presences; persistent `›` input; semantic objects, epistemic labels and elastic
density. No fixed panels, sidebars, cards or web typography. Temporary inspection
overlays are allowed. SPAWN/ROUTE/SETTLE motion remains optional and nonblocking.
Use existing semantic theme tokens. Required character sizes: 80x24,120x30,
160x50,240x70. Under constraint preserve input, required decision, intent,
important Human Delta, critical work, then evidence and optional details.
Source ends mid-section 41. Original-image retrieval remains unresolved, but
this explicit owner design source now specifies the terminal composition.

Owner supplied master: `MASTER-PRODUCT-DIRECTION.source.txt`, preserved verbatim
from attachment `06a5bd10-fdd4-4754-8f5e-b3504f7470e8` on 2026-10-03.
It ends inside section 44 at `CHANGE`. The promised execution order is absent;
do not infer a new critical path from the long-term vision.

Owner corrections in the current conversation take precedence: an understated,
distinctive interface that expresses Cuesheet's way of working. Do not substitute
a conventional terminal emulator or a generic coding chat.

Existing contracts: `08-TERMINAL-UX.md`, `HUMAN-LEGIBILITY.md`,
`README.md`, `INTENT-MAP-ADAPTIVE.md`, `../SHARED-CONTEXT-SPEC.md`,
`../SW-02-mid-run-directive.md`, `../SURFACE-V2.md`.
Vault source: `/Users/memo/Vault/4-Tools/harness-agnostic-2026-09-design.md`:
the Vault owns knowledge; harnesses provide views. This infrastructure spec is
not a visual mockup. Related research must not silently become product decisions.
SURFACE-V2 describes runtime wiring; its terminal transcript is not an approved
visual composition. The latest Open Design prototype is not an accepted reference.

## Product rules

REQ-DD01: The primary surface makes the current intention, useful change,
important observation and unresolved decision understandable. Routine operations
remain quiet; raw tool logs and runtime concepts belong in optional detail.

REQ-DD02: The composer remains available during work. A correction becomes a
fact in the shared state immediately. Show its effect on the current direction;
never represent it as a queued prompt or an independent second conversation.

REQ-DD03: Project binding is optional. A person can begin with an intention
without selecting a repository, mode, agent or workflow first.

REQ-DD04: Claims, produced artifacts and verified results remain distinguishable.
Progress comes from observed activity and elapsed time. Do not invent reasoning,
percentages, evidence or successful completion.

REQ-DD05: Context, sources, agents and their responsibility, models and sessions
are progressively disclosed. The initial view does not display every subsystem.
Corrections and stop controls remain accessible while work continues.

REQ-DD06: English UI; readable contrast; full terminal bounds; stable scrolling;
editable Unicode text; preserved drafts; explicit keyboard focus and accessible
model selection. Check 40x14, 80x24 and 120x40 including resize and overlays.

REQ-DD07: Original generated images govern visual composition once retrieved.
Do not invent typography, palettes or layout and label them previously agreed.

REQ-DD08: An intention becomes a maintainable objective. Cuesheet organizes
steps, agents and useful specs automatically; the person can inspect and correct
them without becoming the coordinator. An execution limit leaves the objective
open and resumable. Changing model retains decisions, constraints, evidence and
acceptance criteria; it does not promise equal model ability.

REQ-DD09: Context is a sourced projection of durable shared records, not a
transcript summary or a separately editable second truth. Current intent,
decisions, impact, unknowns and evidence must be discoverable from that state.
Historical evidence cannot validate a changed workspace.

REQ-DD10: World > Project > Session (master sections 2 to 4). One continuous
conversation can traverse projects, knowledge and capabilities, starting from
home. Project switching, visible cwd changes and new per-project sessions must
not structure the primary experience. Discovery is progressive and inexpensive.

REQ-DD11: Human legibility (master sections 36 to 40) answers what is touched,
where work stands, why, how we know, what remains unknown and what changed.
Surface meaningful deltas, not agent narration. Routine work stays quiet;
important reversible assumptions may be surfaced while work continues;
necessary decisions are exceptional. Do not infer human understanding.

REQ-DD12: Show OBSERVED, INFERRED, ASSUMED and UNKNOWN for material claims with
their sources when consulted (master sections 13 and 14). Source changes can
make knowledge stale. Worker identity is separate from interchangeable compute
(section 21). These distinctions do not justify a wall of runtime metadata.

Scope guard: master sections 8, 12, 18 and other future concepts are product
direction, not immediate implementation tasks. Preserve the existing bounded
dogfooding path; no wholesale scheduler, graph or routing rebuild in this design
correction. UI verification needs implementation, behavior and real render proof
(sections 41 to 43), not prototype claims alone.

## Finite work and acceptance

DD01 DONE: record recovered constraints with source paths. Evidence: this file
and the cited contracts read on 2026-10-03.
DD02 TODO P1: retrieve original images. Acceptance: actual image visible and
traceable to the original conversation, not a textual sketch. Evidence pending.
DD03 TODO P1, depends DD02: reconcile each proposed view with those images and
REQ-DD01 through REQ-DD07. Evidence pending.
DD04 TODO P1, depends DD03: update Open Design views and inspect each interaction,
including correction during work, resizing, scrolling and model selection.
Evidence pending. Preserve previous artifacts for comparison.

Risk: substituting a plausible new design for the owner's established direction.
Mitigation: visual work cannot pass DD03 while DD02 remains open.
Current result is a recovered brief, not a finished redesign.
