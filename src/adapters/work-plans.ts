/** Versioned model-authored plans. These records confer no completion authority. */
import type { Event } from "../core/store.ts";

export interface WorkTask {
  id: string; text: string; expected: string; dependencies: string[]; revision: number;
}
export interface WorkPlan {
  id: string; revision: number; tasks: WorkTask[]; objectiveId: string | null;
}
const bounded = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const identity = (v: unknown): v is string => bounded(v, 128) && /^[a-zA-Z0-9_-]+$/.test(v);

/** Validate all versioned records, including historical plans for other objectives. */
export function projectWorkPlans(events: readonly Event[]): Map<number, WorkPlan> {
  const result = new Map<number, WorkPlan>();
  const prior = new Map<string, WorkPlan>();
  const owners = new Map<string, string>();
  const retired = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.kind !== "note" || e.subject !== "terminal.work" || e.data.operation !== "plan") continue;
    const d = e.data;
    if (d.version === undefined) continue; // Read legacy records without rewriting them.
    const bad = (): never => { throw new Error(`Invalid work plan at sequence ${e.seq}.`); };
    if (d.version !== 1 || !identity(d.id) || d.revision !== e.seq ||
        !["assess", "research", "spec", "build", "review"].includes(String(d.phase)) ||
        !bounded(d.rationale, 4000) || (d.spec !== null && !bounded(d.spec, 20000)) ||
        !Array.isArray(d.tasks) || !Array.isArray(d.taskRecords) || d.taskRecords.length > 40 || d.tasks.length !== d.taskRecords.length ||
        !(d.objectiveId === null || identity(d.objectiveId)) ||
        !(d.objectiveRevision === null || Number.isSafeInteger(d.objectiveRevision) && Number(d.objectiveRevision) < e.seq && Number(d.objectiveRevision) > 0) ||
        !Number.isSafeInteger(d.against) || Number(d.against) >= e.seq) bad();
    const id = d.id as string;
    const previous = prior.get(id);
    if (previous && previous.objectiveId !== d.objectiveId) bad();
    const removed = retired.get(id) ?? new Set<string>();
    const tasks: WorkTask[] = [];
    for (const [index, raw] of (d.taskRecords as unknown[]).entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad();
      const t = raw as Record<string, unknown>;
      if (!identity(t.id) || !bounded(t.text) || !bounded(t.expected) || !Array.isArray(t.dependencies) ||
          !t.dependencies.every(identity) || new Set(t.dependencies).size !== t.dependencies.length ||
          (d.tasks as unknown[])[index] !== t.text || !Number.isSafeInteger(t.revision) || Number(t.revision) > e.seq || Number(t.revision) < 1 ||
          tasks.some(task => task.id === t.id) || removed.has(String(t.id))) bad();
      const task = t as unknown as WorkTask;
      const old = previous?.tasks.find(item => item.id === task.id);
      if (owners.has(task.id) && owners.get(task.id) !== id) bad();
      const unchanged = old && old.text === task.text && old.expected === task.expected && JSON.stringify(old.dependencies) === JSON.stringify(task.dependencies);
      if (task.revision !== (unchanged ? old.revision : e.seq)) bad();
      tasks.push(task); owners.set(task.id, id);
    }
    const visited = new Set<string>();
    const visit = (taskId: string, path: Set<string>): void => {
      if (path.has(taskId)) bad();
      if (visited.has(taskId)) return;
      const task = tasks.find(t => t.id === taskId); if (!task) bad();
      for (const dep of task!.dependencies) visit(dep, new Set([...path, taskId]));
      visited.add(taskId);
    };
    for (const task of tasks) visit(task.id, new Set());
    for (const task of previous?.tasks ?? []) if (!tasks.some(t => t.id === task.id)) removed.add(task.id);
    retired.set(id, removed);
    const plan = {id, revision: e.seq, tasks, objectiveId: d.objectiveId as string | null};
    prior.set(id, plan); result.set(e.seq, plan);
  }
  return result;
}

export function prepareWorkTasks(input: unknown[], prior: WorkTask[], seq: number): WorkTask[] {
  const used = new Set<string>();
  return input.map((raw, index) => {
    const value = typeof raw === "string" ? {text: raw, expected: raw, dependencies: []} : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid work task.");
    const t = value as Record<string, unknown>;
    if (!bounded(t.text) || !bounded(t.expected) || !Array.isArray(t.dependencies) || !t.dependencies.every(identity)) throw new Error("Tasks require text, expected result and dependencies.");
    const old = t.id === undefined ? prior.find(p => p.text === t.text && !used.has(p.id)) : prior.find(p => p.id === t.id);
    if (t.id !== undefined && !old) throw new Error("Explicit task IDs must refer to existing tasks.");
    const id = old?.id ?? `task-${seq}-${index + 1}`;
    used.add(id);
    const unchanged = old && old.text === t.text && old.expected === t.expected && JSON.stringify(old.dependencies) === JSON.stringify(t.dependencies);
    return {id, text: t.text, expected: t.expected, dependencies: t.dependencies as string[], revision: unchanged ? old.revision : seq};
  });
}
