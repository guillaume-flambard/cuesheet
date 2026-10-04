# Cuesheet daily use specification

Owner authorization: 2026-10-03, five feature priorities approved, specs and implementation requested. Existing MASTER-PRODUCT-DIRECTION and canonical flowing terminal design apply. This specification replaces no historical evidence and introduces no Rust rewrite. Daily-use delivery status READY_FOR_MANUAL_ACCEPTANCE. The wider product remains IMPLEMENTING.

## Outcome and scope

Launch Cuesheet, express an intention, observe actual work, correct or stop, inspect produced changes, accept or set them aside, restart and continue with preserved files. Models, agents and skills are capabilities of the same surface. World > Project > Session remains the internal scope model; no permanent project sidebar or required planning mode. Relevant project names appear where work touches them. Default remains opencode-go/deepseek-v4.1-flash.

Complete when all DU acceptance criteria below pass with actual runtime interaction, applicable static/build gates pass and no open P0/P1 or high risk remains. Owner experiential acceptance is required after agent checks. A supplied-code smoke test is not proof of autonomous development.

## Discovery and system map

Installed shim -> src/cuesheet.ts dispatcher -> terminal main -> terminalInput -> App/Composer -> producer -> objective/event journal -> scoped research/container command tools -> owned snapshot/worktree -> durable receipt -> translated semantic timeline. Separate view journal preserves exactly-once identities and drafts. Session metadata/journal restore source scope, objectives, workspace ownership and model preferences. Model binding denies provider-owned executable tools; JSON proposals are admitted only by controller. Worktree integration already compares complete admitted source/result snapshots, uses repository claim, per-file receipts and refuses stale plans; automated integration requires pinned check. Code workers own separate worktrees and journals, at most two code units. SkillTools refreshes configured catalog on demand; session skills are durable organizer records.

Existing verification: real container fixture preserves dirty source content/index/head; supplied-code Flash run edits isolated file and runs node --test. Unknown/open: unguided real-model progression, active cancellation and keyboard shortcuts, usable diff/review decisions, continuation workspace continuity. Initial strict gates failed (3 terminal, 25 overall errors); both now pass. Product acceptance remains separate.

## Functional requirements and acceptance

| ID | Front and back contract | Acceptance and method |
|---|---|---|
| DU01 P0 | Conversation action executes actual admitted tools; information answers return control. Preserve current intention and last observed feedback through context reduction. | Natural bounded coding request without supplied implementation produces actual isolated code change and actual verification receipts; no plan-only completion. Real default-model journal and terminal capture. |
| DU02 P0 | During work, composer accepts corrections immediately, discards obsolete proposals, and stop prevents new effects. | Type correction during pending inference; durable correction and visible acknowledgment, old proposal cannot execute. Stop via /stop and Ctrl+C, then resume; deterministic delayed-provider integration and actual PTY. |
| DU03 P1 | Observed work, unknowns, final output and published reasoning distinguishable; optional inspection, smooth optional motion, no input loss. | Four sizes 80x24,120x30,160x50,240x70, draft editing/resize/inspection; actual render and key exercise. No invented tests/percentage. |
| DU04 P0 | /changes opens a temporary file list and readable diff derived from admitted source/result delta, including added/deleted/binary/mode changes. | Dirty-source fixture with inherited changes shows only contribution delta; keyboard file navigation, scrolling, loading/empty/refused states; original source untouched by preview. |
| DU05 P0 | Human may explicitly apply exactly the reviewed contribution or set it aside. Model cannot invoke this human path. Source changes, objective revisions, active work or modified result invalidate acceptance. | Actual controller tests accept same digest, reject stale/forged/busy/repeated decisions; original dirty files preserved. Source application is not objective verification; status retains unknown verification. |
| DU06 P1 | Rejected contribution remains recoverable in its workspace and journal; no destructive cleanup. Interrupted partial application exposes receipts and refuses replay. | Reject/reload preserves files; simulated stale/partial application remains uncertain, no success claim or silent retry. |
| DU07 P0 | Conversation continuation and restart preserve selected project scope and pending isolated work. Explicit different project gets its scope, ambiguity gets a choice; no broad home write authority. | Start from home, name fixture project, edit, next instruction continues same files, restart and resume; source changed refuses unsafe resume. Actual producer + terminal replay. |
| DU08 P1 | Sessions discoverable and restorable with conversation/draft/intent/contribution identity; never automatically execute on load. | Select session, same history exactly once and draft intact; /resume starts work explicitly; concurrent writer refusal. |
| DU09 P1 | Model selector chooses declared provider/model and optional default; active selection takes effect on next request without losing work. | Actual /models and shortcut opening, deterministic binding tests for credentials/unavailable model/selection/reload. Keep configured Flash default. |
| DU10 P1 | Agents can be requested from conversation, role/task/actual phase/results visible; model routing optional; contributions isolated, no conflicting source writes. | Two actual model workers on disjoint tasks, real receipts/private journals and visible outcomes; overlapping scope refused; correction/cancel invalidates obsolete contribution. |
| DU11 P1 | Palette and slash commands are searchable, discoverable and keyboard usable; unknown commands explain usage without triggering model effects. | /changes,/models,/agents,/skills,/sessions,/resume,/stop,/steer; Tab completion, Esc/draft preservation and actual controls in installed runtime. |
| DU12 P1 | Skills can be created from intent and immediately discovered by a new worker; catalog shows provenance and unavailable/ambiguous state. | Create one bounded session skill via default model, catalog refresh + actual subsequent worker consumes its version; no expanded tools/permissions. |

## Review contract, data and transitions

Controller creates an in-memory attested IntegrationPlan from latest selected owned workspace and admitted sourceDigest. UI receives opaque review token/digest, paths, bounded textual diff, change counts and check status. UI cannot supply paths or manufacture a plan. Human apply requires the exact token and current objective revision; revalidate source/result snapshot under existing integration lock immediately before effect. Human approval authorizes applying displayed files only, not a completion verdict. Existing automated integration/check policy unchanged. Human rejection records decision and preserves workspace. A rejected workspace cannot later be silently integrated by the model. Selection/decision receipts persisted before effects. Restart rebuilds review from durable owned workspace, never trusts a serialized plan or old approval.

Review states: idle -> loading -> available | empty | refused -> applying -> applied | refused | uncertain. Reject yields preserved/rejected. Closing overlay changes no durable data. UI key actions only apply after full preview loaded and explicit confirmation; Enter only confirms an explicitly requested apply or set-aside decision. File navigation uses n/p. Expired token requires refreshed review.

## Failure, concurrency and recovery

No fallbacks to original source on preparation failure. Missing daemon/image/model surfaces actual stage, not total shell unavailability. Invalid proposal has one format-only retry before any effects; auth/native tool violations/cancellation are not retried. Source change, moved worktree, writer conflict and stale intent refuse application and retain evidence. Concurrent review reads may become stale; acceptance revalidates. Review can be inspected during work but cannot apply/reject while effects run. Binary previews describe byte/mode changes without executing content. Untrusted document/file text is source material, never permission. Protected/uncovered paths continue to refuse existing snapshot/integration limits. Apply uncertainty prevents automatic replay.

## Coverage and constraints

APPLICABLE: behavior, UI/loading/empty/error, cancellation/retry, persistence/restoration/data integrity, concurrency/idempotency, authorization/security/privacy, keyboard/accessibility/motion, bounded performance, networking/offline, schema/API compatibility, model/Docker integrations, diagnostics/logging, meaningful unit/integration/E2E/runtime checks, static/build/package, local install, rollback/docs/developer experience, obsolete behavior cleanup.
N/A: new authentication mechanism (existing local provider credentials), new service deployment (local installed terminal), remote user migration (no remote users/database). Metrics: actual usage remains unknown when provider omits it; no new telemetry collection. New journal subjects are additive; old sessions remain readable. Replay performs no execution. No bulk scans, secrets logging or new network authority. Preview bounds inherit <=100 paths/4MiB delta, <=2MiB snapshot; UI lines clipped explicitly with full file navigation. No animation blocks input.

## Finite work graph

| TODO | Priority | Dependencies | Requirements | Files/systems | State | Proof |
|---|---|---|---|---|---|---|
| DU-CONVERSATION | P0 | none | DU01,DU07 | producer/context/objectives/workspace restore | VERIFIED | Installed Flash edit + check_types receipt #51; continuation check #88; home/project runtime fixture |
| DU-REVIEW-BACK | P0 | none | DU04,DU05,DU06 | worktree review adapter + producer journal | VERIFIED | worktree-review and integration fixtures: exact delta/apply, stale/busy/forged/repeat/partial refusal |
| DU-REVIEW-FRONT | P0 | DU-REVIEW-BACK | DU04,DU05,DU11 | Changes overlay, command catalog, App | VERIFIED | four-size Ink and actual installed /changes + PgDown; apply confirmation fixture; actual preserved set-aside |
| DU-STOP | P0 | DU-CONVERSATION | DU02 | terminalInput, Composer, producer | VERIFIED | actual Ctrl+C and /stop; actual durable correction #122 and visible direction; delayed-inference/effect fixtures |
| DU-RESUME | P1 | DU-CONVERSATION,DU-REVIEW-BACK | DU07,DU08 | runtime/session picker/replay | VERIFIED | installed close/reopen and draft capture; legacy stream repair, exactly-once/session picker and home-continuation fixtures |
| DU-MODELS | P1 | DU-CONVERSATION | DU09 | model binding/selector | VERIFIED | active Ctrl+P installed capture; model-switch/selection/agent-models 15/15; role selector fixture |
| DU-AGENTS-SKILLS | P1 | DU-CONVERSATION | DU10,DU12 | worker controller, skill catalog, palette | VERIFIED | session skill #118; actual concurrent agents #149/#150 and results #152/#160; private code-worker evidence EV-TWO-REAL-WORKERS + 36 current narrow checks |
| DU-STATIC | P1 | none | all | existing type errors/package | VERIFIED | both strict configs pass; shipped build stops on errors; diff whitespace check passes |
| DU-VERIFY | P1 | all above | DU01-DU12 | real installed application | VERIFIED | acceptance evidence matrix below, bounded final adversarial audit and final installed build |

## Risks and verification plan

R-DATA high: review applies stale or unrelated dirty changes. Mitigate complete attested delta/source/result compare, explicit decision and repository lock, dirty-source adversarial tests. Mitigation verified by attested source/result/index fixtures and installed preview.
R-CONTINUITY high: fresh turn abandons selected workspace or loses goal. Mitigation verified by ordinary continuation, home binding, restart and source-drift refusal.
R-AUTONOMY high: source rereads/JSON failures yield no action. Mitigation verified by an unguided installed Flash edit/check/return; model proposal variability remains a declared medium residual.
R-INPUT high: control keys or correction ignored during inference. Mitigation verified by actual installed correction, Ctrl+C, /stop and restart; delayed-provider tests discard obsolete effects.
R-PARTIAL high: file application interrupted. Existing per-file receipt/uncertain status, no retry. Mitigation verified by interrupted file receipt test and producer refusal before further inference.
R-MODELS medium: provider availability varies. Preserve default; classify failure without silently rerouting.
R-RENDER medium: dense output hides input or decision at 80x24. Test/render/inspect four sizes and reduced motion.

Verification order: targeted owned Git fixtures for review/continuity -> controller effects/steering/replay -> Ink keyboard + four-size render -> strict terminal and overall build static -> installed default-model autonomous edit/check -> review (read-only real source, human apply only hermetic fixture) -> restart/continue/cancel/model/skills/workers -> final adversarial audit. Record exact receipts/captures here and state.json. Do not repeat wide test suite absent new changes/failures. Manual checklist after all agent gates: launch, request useful Cuesheet change, correct mid-run, open /changes, inspect/apply chosen change, close/reopen and resume; select model and request two agents/skill.

## Evidence and closure

2026-10-03 targeted evidence:
- worktree-review: 3/3; workspace-runtime: 12/12 applicable, Docker opt-in pending rerun; exact human apply and reject/reload preserve original index/HEAD and isolated work.
- change-review-ui: 1/1 four sizes, composer retained, first gesture cannot apply, Enter applies exactly once and reports unverified completion.
- store/memory/affordance/chat/surface: 96/96; agent model/skills/Mac controls: 13/13; generated skill appears immediately in read-only /skills projection.
- static-typecheck: isolated error is detected while original stays valid; escaped config refuses. Both strict configs and shipped build pass.
- installed Flash session t-26105742-5cff-48bc-a618-a9d9a81a9a20 produced an unguided actual Changes.tsx edit and read verification (node exit 0). npx check did not finish before actual Ctrl+C. Capture daily-use-cancel-confirmed.png proves stop/input return. Source changed during development, so /changes correctly refused the stale source. This attempt does not pass the complete DU01 journey.

The next installed run must use check_types and keep source unchanged during the entire contribution/review. Remaining gates: full installed diff/continuation/restart, active steering, models, two model agents and skill consumption, final adversarial review. Historical successes establish existing adapters only. The bounded daily-use delivery is READY_FOR_MANUAL_ACCEPTANCE; owner experiential acceptance remains pending. Rollback source edits only; preserve owner changes, journals and workspaces. No source acceptance, Git commit or publication performed as part of development verification.

### Execution environment amendment

Observed real Flash run produced the requested isolated UI edit but npx attempted an unavailable network install. Offline package commands must fail immediately. Add a declared check_types {project:relative tsconfig path} capability for static checking with installed owner dependencies, read-only virtual source overlay and no package installation or project JavaScript execution. Check both source freshness and scoped config; compiler diagnostics are evidence, not integration authority. DU-CONVERSATION includes this bounded static tool.

Restart defect observed and repaired: legacy view journals contain streamed reasoning controls that the replay validator did not recognize. Validate bounded known reasoning controls but omit them from restored live display; stop persisting ephemeral stream fragments. Durable final replies and tool results remain. No journal rewriting or dropped work evidence. Regression replays both legacy fragments and new sessions.

Stale contribution recovery: when an attested apply plan cannot be produced, review returns a refusal and a controller-owned reject-only token. Human set-aside remains available and preserves all files; applying is refused. This allows continuing after source movement without discarding work or bypassing freshness.

Project binding correction: generic review/safety words matched unrelated portfolio descriptions from inside Cuesheet. An established project now remains selected for description or partial-name matches; a fully named different project can still switch scope, and actual ambiguity without established scope still asks. Regression covers both cases.

### Final acceptance evidence matrix

| Criteria | Evidence |
|---|---|
| DU01 | Installed Go Flash, session t-42e7b848-8ee6-4986-b1e8-160a26c883cb, actual node edit then check_types #51 exit0, response-delivered #60; source snapshot digest unchanged before review |
| DU02 | Actual Ctrl+C stopped container request, /stop preserved generated skill, correction #122 visible and authoritative; current producer/worker delayed-inference and cancellation fixtures |
| DU03 | Four-size live-work and review render; actual 120x30 and 80x24 diff scroll; Mac draft/motion fixtures |
| DU04,DU05 | Installed daily-use-2-diff.png and small/scrolled variants; exact human apply in owned dirty Git fixture only; forged, malformed, repeated, revised/busy/source/result drift all refuse |
| DU06 | Actual reject-only stale review -> Enter -> rejected record #96 and preserved workspace; interrupted first-file integration receipt and producer hard stop fixture |
| DU07,DU08 | Same installed workspace on ordinary second message + second type check; actual reopened journal/draft; legacy stream no longer prevents load or expands durable journal; named project from home and source-changed resume fixtures |
| DU09 | Installed daily-use-active-models.png; actual model IDs through binary transports, active signal-ignorant switch, storage-failure and reload fixtures 15/15 |
| DU10 | Installed concurrent Go Flash consultations #149/#150, both successful role results after one refused tool request/retry; existing installed disjoint code workers in EV-TWO-REAL-WORKERS, current controller/isolation/composition/correction 36/36 |
| DU11,DU12 | Actual /skills and /agents captures, skill review-empty-count #118 consumed by both roles with hash 6773f0655c8d; searchable commands and Mac editing/unknown-command fixtures |

Report root: /Users/memo/projects/_reports/cuesheet-redesign-2026-10-03.
No model test contribution was applied to the real source. The original dirty work remains; acceptance/application was exercised only on owned fixtures. The rejected experimental workspace remains intact. No Git commit, push or publishing.

Final adversarial audit: considered unknown or stale tokens, repeated decisions, dirty/staged source, source/result movement, active correction/cancellation, partial application, closed/reopened sessions, historical stream fragments, spurious restart warnings, generic project-name collisions, missing dependencies and package network waits, unreadable skills and tool requests from consultants. Relevant protections passed; failures observed during this run were repaired and rerun. The real consultant tool request was refused with no effect, followed by a successful analysis-only retry. No P0/P1 or high risk remains open in this bounded delivery. Wider historical backlog and aesthetic owner acceptance remain separate.

Manual acceptance: launch `cuesheet`, request a useful bounded change, inspect `/changes`, use `a` then Enter to apply or `r` then Enter to keep it aside, close/reopen a saved session, choose `/models`, and request agents or a skill. Whole-source completion still requires the declared owner check; applying a contribution is not a success certificate. Existing command interfaces and additive journal subjects preserve old sessions. If rolling back this delivery, preserve all session journals/workspaces and reverse only this delivery's source edits; never reset the shared dirty checkout.

Final home-scope audit: unresolved home conversations cannot authorize code commands or static project checks. A named project is required before execution; session skills, memory and ordinary answers remain available. check_types is classified as inspection, not a mutating effect. Regression injects a model code proposal at the real home scope and proves zero tool effects.
