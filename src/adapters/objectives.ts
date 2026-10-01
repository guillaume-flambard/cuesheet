import type { Event, EventStore } from "../core/store.ts";

export const OBJECTIVE_SUBJECT = "terminal.objective";
export type ObjectiveStatus = "active" | "blocked" | "paused" | "abandoned" | "replaced" | "verified";
export interface Objective {
  id: string; intention: string; text: string; scope: string; exclusions: string[];
  dependencies: string[]; constraints: string[]; criteria: string[];
  corrections: { text: string; source: number }[];
  revision: number; created: number; status: ObjectiveStatus;
  author: "human" | "model" | "unknown"; sources: number[];
  originalText: string; descriptionAuthor: "human" | "model" | "unknown";
  check: { digest: string; boundRevision: number } | null;
}
export interface ObjectiveState { current: Objective | null; objectives: Objective[] }

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 20000;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(nonempty);
}
function malformed(seq: number): never { throw new Error(`Invalid objective record at sequence ${seq}.`); }

/** Pure replay, including conservative read-only identities for legacy goals. */
export function projectObjectives(events: readonly Event[]): ObjectiveState {
  const objectives = new Map<string, Objective>();
  let current: string | null = null;
  let managed = false;
  for (const event of events) {
    if (event.kind === "goal" && !managed) {
      const id = `legacy-goal-${event.seq}`;
      objectives.set(id, { id, intention: id, text: typeof event.data.text === "string" ? event.data.text : "",
        scope: "", exclusions: [], dependencies: [], constraints: [], criteria: [], corrections: [],
        revision: event.seq, created: event.seq, status: "active", author: "unknown", descriptionAuthor: "unknown",
        originalText: typeof event.data.text === "string" ? event.data.text : "", sources: [event.seq], check: null });
      current = id;
    }
    if (event.kind !== "note" || event.subject !== OBJECTIVE_SUBJECT) continue;
    managed = true;
    const data = event.data;
    if (data.version !== 1 || !nonempty(data.id)) malformed(event.seq);
    if (data.operation === "create") {
      if (objectives.has(data.id) || !nonempty(data.text) || typeof data.scope !== "string" ||
          !Number.isSafeInteger(data.source) || !events.some(source => source.seq === data.source && source.seq < event.seq)) malformed(event.seq);
      const check = data.checkDigest;
      if (check !== undefined && (typeof check !== "string" || !/^[a-f0-9]{64}$/.test(check))) malformed(event.seq);
      if (data.author !== undefined && data.author !== "human" && data.author !== "model" && data.author !== "unknown") malformed(event.seq);
      const author = data.author === undefined ? "unknown" : data.author;
      objectives.set(data.id, { id: data.id, intention: `intent-${data.source}`, text: data.text,
        scope: data.scope, exclusions: [], dependencies: [], constraints: [], criteria: [], corrections: [],
        revision: event.seq, created: event.seq, status: "active", author,
        descriptionAuthor: author, originalText: data.text, sources: [data.source as number],
        check: typeof check === "string" ? { digest: check, boundRevision: event.seq } : null });
      current = data.id;
    } else {
      const prior = objectives.get(data.id);
      if (!prior || data.expected !== prior.revision) malformed(event.seq);
      if (data.operation === "correct") {
        if (!nonempty(data.text) || !Number.isSafeInteger(data.source) || !events.some(source => source.seq === data.source && source.seq < event.seq)) malformed(event.seq);
        objectives.set(data.id, { ...prior, revision: event.seq, status: "active",
          corrections: [...prior.corrections, { text: data.text, source: data.source as number }],
          sources: [...prior.sources, data.source as number] });
      } else if (data.operation === "describe") {
        if (!nonempty(data.text) || !strings(data.exclusions) || !strings(data.dependencies) ||
            !strings(data.constraints) || !strings(data.criteria) || !nonempty(data.rationale) ||
            data.dependencies.some(id => id === prior.id || !objectives.has(id))) malformed(event.seq);
        const next = { ...prior, text: data.text, exclusions: data.exclusions, dependencies: data.dependencies,
          constraints: data.constraints, criteria: data.criteria };
        const cycle = (id: string, visited: Set<string>): boolean => {
          if (id === prior.id) return true;
          if (visited.has(id)) return false;
          visited.add(id);
          return (objectives.get(id)?.dependencies ?? []).some(dep => cycle(dep, visited));
        };
        if (next.dependencies.some(id => cycle(id, new Set()))) malformed(event.seq);
        // Description is a model interpretation; it cannot remove human corrections
        // or change the authoritative check binding. Its revision still invalidates plans.
        objectives.set(data.id, { ...next, revision: event.seq, descriptionAuthor: "model" });
      } else if (data.operation === "bind_check") {
        if (data.author !== "human" || typeof data.checkDigest !== "string" || !/^[a-f0-9]{64}$/.test(data.checkDigest) ||
            !Number.isSafeInteger(data.source) || !events.some(source => source.seq === data.source && source.seq < event.seq &&
              source.kind === "note" && source.subject === "terminal.user" && source.data.operation === "confirm_check" &&
              source.data.objectiveId === prior.id && source.data.objectiveRevision === prior.revision && source.data.checkDigest === data.checkDigest)) malformed(event.seq);
        objectives.set(data.id, {...prior,revision:event.seq,status:"active",sources:[...prior.sources,data.source as number],
          check:{digest:data.checkDigest,boundRevision:event.seq}});
      } else if (data.operation === "verify") {
        if (!prior.check || prior.check.boundRevision !== prior.revision || data.checkDigest !== prior.check.digest ||
            !nonempty(data.record) || data.contractRevision !== prior.revision ||
            !events.some(source => source.seq === data.verification && source.seq < event.seq && source.kind === "work_verified" &&
              source.data.verdict === "VERIFIED" && source.data.record === data.record && source.data.checkDigest === data.checkDigest &&
              source.data.objectiveId === prior.id && source.data.objectiveRevision === prior.revision)) malformed(event.seq);
        objectives.set(data.id, { ...prior, status: "verified" });
      } else if (data.operation === "status") {
        if (!["active", "blocked", "paused", "abandoned", "replaced"].includes(String(data.status)) || !nonempty(data.reason)) malformed(event.seq);
        objectives.set(data.id, { ...prior, status: data.status as ObjectiveStatus });
      } else malformed(event.seq);
      current = data.id;
    }
  }
  return { current: current ? objectives.get(current) ?? null : null, objectives: [...objectives.values()] };
}

export function changeObjectiveStatus(store: EventStore, status: Exclude<ObjectiveStatus, "verified">, reason: string): void {
  const current = projectObjectives(store.toSession().events).current;
  if (!current || current.id.startsWith("legacy-")) return;
  const event: Event = { kind: "note", subject: OBJECTIVE_SUBJECT, seq: store.revision + 1, at: 0,
    data: { version: 1, operation: "status", id: current.id, expected: current.revision, status, reason } };
  projectObjectives([...store.toSession().events, event]);
  store.append({ kind: event.kind, subject: event.subject, data: event.data });
}

/** New requests always get a distinct identity, even with the same wording. */
export function createObjective(store: EventStore, text: string, scope: string, source: number, checkDigest?: string, author: "human" | "unknown" = "human"): Objective {
  const id = `objective-${store.revision + 1}`;
  const event: Event = { kind: "note", subject: OBJECTIVE_SUBJECT, seq: store.revision + 1, at: 0,
    data: { version: 1, operation: "create", id, text, scope, source, author, ...(checkDigest ? { checkDigest } : {}) } };
  projectObjectives([...store.toSession().events, event]);
  store.append({ kind: event.kind, subject: event.subject, data: event.data });
  return projectObjectives(store.toSession().events).current!;
}

export function verifyObjective(store: EventStore, verification: Event, digest: string, record: string): boolean {
  const current = projectObjectives(store.toSession().events).current;
  if (!current || !current.check || current.check.boundRevision !== current.revision || current.check.digest !== digest || verification.data.objectiveId !== current.id || verification.data.objectiveRevision !== current.revision) return false;
  const event: Event = { kind: "note", subject: OBJECTIVE_SUBJECT, seq: store.revision + 1, at: 0,
    data: { version: 1, operation: "verify", id: current.id, expected: current.revision,
      contractRevision: current.revision, verification: verification.seq, checkDigest: digest, record } };
  projectObjectives([...store.toSession().events, event]);
  store.append({ kind: event.kind, subject: event.subject, data: event.data });
  return true;
}

export function correctObjective(store: EventStore, text: string, source: number): Objective | null {
  const current = projectObjectives(store.toSession().events).current;
  if (!current) return null;
  const event: Event = { kind: "note", subject: OBJECTIVE_SUBJECT, seq: store.revision + 1, at: 0,
    data: { version: 1, operation: "correct", id: current.id, expected: current.revision, text, source } };
  projectObjectives([...store.toSession().events, event]);
  store.append({ kind: event.kind, subject: event.subject, data: event.data });
  return projectObjectives(store.toSession().events).current;
}


/** Only an explicit human receipt may renew a contract's authoritative check. */
export function bindObjectiveCheck(store:EventStore, binding:{id:string;revision:number;digest:string;source:number}):boolean {
  const current=projectObjectives(store.toSession().events).current;
  if(!current || current.id!==binding.id || current.revision!==binding.revision || current.id.startsWith("legacy-"))return false;
  const event:Event={kind:"note",subject:OBJECTIVE_SUBJECT,seq:store.revision+1,at:0,data:{version:1,operation:"bind_check",id:binding.id,expected:binding.revision,checkDigest:binding.digest,source:binding.source,author:"human"}};
  projectObjectives([...store.toSession().events,event]);store.append({kind:event.kind,subject:event.subject,data:event.data});return true;
}
