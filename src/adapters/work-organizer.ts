import type { Event, EventStore } from "../core/store.ts";
import type { ToolRequest, ToolResult } from "../core/loop.ts";
import { MEMORY_SUBJECT, projectMemory } from "./work-memory.ts";

export const WORK_SUBJECT = "terminal.work";
export const AUTONOMOUS_TOOLS = ["organize_work", "remember", "create_skill"];
export const AUTONOMOUS_POLICY =
  "You manage the work process automatically. The user supplies intent and corrections, not modes or bookkeeping commands. " +
  "Choose the lightest useful next step from assessment, research, specification, build and review. " +
  "Use organize_work when a durable plan/spec/checklist helps: input {phase,rationale,spec?,tasks?}; phases assess,research,spec,build,review; tasks are strings. " +
  "Revisit plans after observations or corrections. Do not create ceremony for a trivial task. " +
  "Maintain useful decisions, constraints and open questions from ordinary exchanges using remember: input {operation:'create'|'edit'|'resolve',kind?:'decision'|'constraint'|'question',id?,text,rationale,sources:[event sequence numbers]}. " +
  "Your memory is an interpretation, never a human instruction or verified evidence. Human memory cannot be overwritten by you. " +
  "Use existing capabilities and inspect relevant material first. For an observed reusable need, create_skill with {name,instructions,rationale,sources:[event sequence numbers]}; it creates session-local instructions, not privileges. " +
  "After changing work state, derive your next action from a fresh inference. These tools cannot certify completion. " +
  "Use only available tools. Do not claim web research, documentation reads or tests without observed results. Ask only for genuinely missing information or actions outside the entrusted scope.";

function text(value: unknown, limit = 20000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

export function projectOrganization(events: readonly Event[]) {
  const records = events.filter(event => event.kind === "note" && event.subject === WORK_SUBJECT);
  const goal = events.filter(event => event.kind === "goal").at(-1)?.data.text ?? null;
  const plan = records.filter(event => event.data.operation === "plan" && event.data.goal === goal).at(-1);
  const skills = new Map<string, { revision: number; by: string; name: unknown; instructions: unknown; rationale: unknown; sources: unknown }>();
  for (const event of records) if (event.data.operation === "skill" && typeof event.data.name === "string") {
    skills.set(event.data.name, { revision: event.seq, by: "model", name: event.data.name, instructions: event.data.instructions, rationale: event.data.rationale, sources: event.data.sources });
  }
  return { plan: plan ? { ...plan.data, spec: plan.data.spec, tasks: plan.data.tasks, revision: plan.seq, by: "model" } : null, skills: [...skills.values()] };
}

/** Model-authored work records have no path to evidence or goal closure. */
export function organizeWork(store: EventStore, request: ToolRequest): ToolResult | null {
  if (!AUTONOMOUS_TOOLS.includes(request.name)) return null;
  const input = request.input;
  const refuse = (output: string): ToolResult => ({ name: request.name, exit: 2, output });
  if (!text(input.rationale, 4000)) return refuse("A bounded rationale is required.");
  const basis = store.revision;
  let data: Record<string, unknown>;
  let subject = WORK_SUBJECT;
  if (request.name === "organize_work") {
    if (!["assess", "research", "spec", "build", "review"].includes(String(input.phase))) return refuse("Unknown phase.");
    if (input.spec !== undefined && !text(input.spec)) return refuse("Invalid specification.");
    if (input.tasks !== undefined && (!Array.isArray(input.tasks) || input.tasks.length > 40 || !input.tasks.every(task => text(task, 2000)))) return refuse("Tasks must be a bounded array of text.");
    const events = store.toSession().events;
    const prior = projectOrganization(events).plan;
    data = { operation: "plan", phase: input.phase, rationale: input.rationale,
      spec: input.spec ?? prior?.spec ?? null, tasks: input.tasks ?? prior?.tasks ?? [],
      goal: store.toSession().goal?.text ?? null, against: basis };
  } else if (request.name === "create_skill") {
    if (typeof input.name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(input.name) || !text(input.instructions)) return refuse("Invalid skill name or instructions.");
    const events = store.toSession().events;
    if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > 20 || !input.sources.every(seq => typeof seq === "number" && events.some(event => event.seq === seq))) return refuse("A reusable skill must name existing source event sequences.");
    data = { operation: "skill", name: input.name, instructions: input.instructions, rationale: input.rationale, sources: input.sources, against: basis };
  } else {
    subject = MEMORY_SUBJECT;
    if (!["create", "edit", "resolve"].includes(String(input.operation)) || !text(input.text, 4000)) return refuse("Invalid memory operation or text.");
    const events = store.toSession().events;
    if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > 20 || !input.sources.every(seq => typeof seq === "number" && events.some(event => event.seq === seq))) return refuse("Memory must name existing source event sequences.");
    if (input.operation === "create") {
      if (!["decision", "constraint", "question"].includes(String(input.kind))) return refuse("Invalid memory kind.");
    } else {
      const prior = projectMemory(events).find(item => item.id === input.id);
      if (!prior || prior.by !== "model") return refuse("Unknown memory or human-owned record; preserve it and record your interpretation separately.");
    }
    data = { operation: input.operation, kind: input.kind, id: input.id, text: input.text, rationale: input.rationale, sources: input.sources, author: "model", against: basis };
  }
  const event = store.appendIfCurrent(basis, { kind: "note", subject, data });
  return event ? { name: request.name, exit: 0, output: JSON.stringify({ revision: event.seq, id: subject === MEMORY_SUBJECT && input.operation === "create" ? `m-${event.seq}` : input.id, recorded: true, verified: false }) }
    : refuse("Work moved; reread the current state before proposing a replacement.");
}
