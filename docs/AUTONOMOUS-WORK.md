# Autonomous work control

Full product specs and remaining execution order: [harness/README.md](harness/README.md)
and [harness/TODO.md](harness/TODO.md). This document records the initial slice.

The default interaction is an intention and ordinary corrections. The model-backed
harness chooses the next useful step instead of asking the person to select a mode.
It can inspect, research, specify, build and review as needed. A spec or checklist
is justified by uncertainty and task complexity, not required for every request.

## This slice

The terminal offers internal tools, handled before the shell runner:

- `organize_work`: record the chosen phase, rationale, optional specification and tasks.
- `remember`: maintain sourced model interpretations of decisions, constraints and questions.
- `create_skill`: record a session-local reusable instruction for an observed need.

All three write the same durable journal and are automatically available. Their
results reach the next inference and any replacement provider. Model memory cannot
overwrite a human memory record. Every memory interpretation names existing source
event sequences and its rationale. None of these tools closes a goal or certifies
a task. Updating the working state invalidates subsequent calls in the same batch:
the next action must be derived against the new context.

The model receives a standing policy: use the lightest process that helps; maintain
memory from ordinary conversation; do not ask the user to operate these tools;
inspect the workspace and use existing capabilities before creating a skill;
turn observed failures into revised plans, not a success announcement.

## Acceptance

An ordinary feature request leads a scripted provider through planning, automatic
memory, a reusable skill and implementation without a manual command. Independent
verification alone closes the goal. Journal reload reconstructs control state;
malformed requests, unknown sources and human-memory overwrites write nothing.

## Remaining

- Web search and documentation retrieval with source attribution and cancellation.
- Discover and reuse installed skills in the terminal runtime.
- Show the derived work state directly in the interface.
- Measure this policy with real weak and strong providers and a common oracle.
- Automatic continuation/context renewal across execution budgets.

Session-local skills are recorded instructions, not installed plugins or executable
capabilities. Specs and tasks are model-authored work records, not verified outcomes.
No network tool or background scheduler is introduced in this slice.

The deterministic end-to-end test uses a real shell write and a real independent
oracle against a capture. It verifies the integration and refusal of a stale tool
batch after a plan update, not the planning ability of a live provider. The plan
retains its spec/tasks on phase changes and is not reused for a different goal text.
Generated skills and memory retain journal source sequences and model authorship.
