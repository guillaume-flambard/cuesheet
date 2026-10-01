import { createHash } from "node:crypto";
import type { Event, EventStore } from "../core/store.ts";

export const MEMORY_SUBJECT = "terminal.memory";
export type MemoryKind = "decision" | "constraint" | "question";
export interface WorkMemory {
  id: string; kind: MemoryKind; text: string; active: boolean;
  created: number; revision: number; by: string;
  rationale?: string; sources?: number[];
  extractionKey?: string; objectiveId?: string | null; objectiveRevision?: number | null;
}

/** Exact-source identity, not semantic equivalence or evidence of truth. */
export function memoryExtractionKey(kind: unknown, text: unknown, sources: readonly number[]): string {
  return createHash("sha256").update(JSON.stringify([kind,text,[...new Set(sources)].sort((a,b)=>a-b)])).digest("hex");
}
export function findMemoryExtraction(events: readonly Event[], kind: unknown, text: unknown, sources: number[]): Event | undefined {
  const key = memoryExtractionKey(kind, text, sources);
  return events.find(e => e.kind === "note" && e.subject === MEMORY_SUBJECT && e.data.operation === "create" && e.data.author === "model" &&
    Array.isArray(e.data.sources) && e.data.sources.every(v => typeof v === "number") && memoryExtractionKey(e.data.kind,e.data.text,e.data.sources as number[]) === key);
}

export function projectMemory(events: readonly Event[]): WorkMemory[] {
  const items = new Map<string, WorkMemory>();
  const keys = new Set<string>();
  const sourceSequences = new Set(events.map(e => e.seq));
  for (const event of events) {
    if (event.kind !== "note" || event.subject !== MEMORY_SUBJECT) continue;
    const { operation, text, id, kind } = event.data;
    if (event.data.version !== undefined) {
      const d = event.data;
      const invalid = (): never => { throw new Error(`Invalid memory record at sequence ${event.seq}.`); };
      if (d.version !== 1 || d.author !== "model" || typeof text !== "string" || !text.trim() || text.length > 4000 ||
          typeof d.rationale !== "string" || !d.rationale.trim() || d.rationale.length > 4000 ||
          !Array.isArray(d.sources) || d.sources.length < 1 || d.sources.length > 20 ||
          !d.sources.every(seq => Number.isSafeInteger(seq) && Number(seq) < event.seq && sourceSequences.has(Number(seq))) ||
          !(d.objectiveId === null || typeof d.objectiveId === "string" && d.objectiveId.length > 0) ||
          !(d.objectiveRevision === null || Number.isSafeInteger(d.objectiveRevision) && Number(d.objectiveRevision) > 0 && Number(d.objectiveRevision) < event.seq)) invalid();
      if (operation === "create") {
        if (!["decision","constraint","question"].includes(String(kind)) || d.extractionKey !== memoryExtractionKey(kind,text,d.sources as number[]) || keys.has(String(d.extractionKey))) invalid();
        keys.add(String(d.extractionKey));
      } else if (operation === "edit" || operation === "resolve") {
        const prior = typeof id === "string" ? items.get(id) : undefined;
        if (!prior || prior.by !== "model" || d.expected !== prior.revision) invalid();
      } else invalid();
    }
    if (typeof text !== "string" || !text.trim()) continue;
    const provenance = { by: event.data.author === "model" ? "model" : "human",
      rationale: typeof event.data.rationale === "string" ? event.data.rationale : undefined,
      sources: Array.isArray(event.data.sources) ? event.data.sources.filter((source): source is number => typeof source === "number") : undefined };
    if (operation === "create" && (kind === "decision" || kind === "constraint" || kind === "question")) {
      const key = `m-${event.seq}`;
      items.set(key, { id: key, kind, text, active: true, created: event.seq, revision: event.seq, ...provenance,
        ...(event.data.version === 1 ? {extractionKey: event.data.extractionKey as string, objectiveId: event.data.objectiveId as string | null, objectiveRevision: event.data.objectiveRevision as number | null} : {}) });
    } else if ((operation === "edit" || operation === "resolve") && typeof id === "string") {
      const prior = items.get(id);
      if (prior) items.set(id, { ...prior, text, active: operation === "edit", revision: event.seq, ...provenance });
    }
  }
  return [...items.values()];
}

/** Returns null for ordinary chat. Each successful mutation is one durable event. */
export function memoryCommand(store: EventStore, input: string): string | null {
  if (!/^\/memory(?:\s|$)/.test(input)) return null;
  const tail = input.slice(7).trim();
  const items = projectMemory(store.toSession().events);
  if (!tail) return items.length ? items.map(item =>
    `${item.id} · ${item.by} · ${item.kind} · ${item.active ? "active" : "resolved"} · ${item.text}`).join("\n") : "Mémoire vide. /memory decision|constraint|question TEXTE";
  const add = /^(decision|constraint|question)\s+([\s\S]+)$/.exec(tail);
  if (add) {
    const event = store.append({ kind: "note", subject: MEMORY_SUBJECT, data: { operation: "create", kind: add[1], text: add[2]!.trim() } });
    return `m-${event.seq} enregistré.`;
  }
  const update = /^(edit|resolve)\s+(m-\d+)\s+([\s\S]+)$/.exec(tail);
  if (update && items.some(item => item.id === update[2])) {
    store.append({ kind: "note", subject: MEMORY_SUBJECT, data: { operation: update[1], id: update[2], text: update[3]!.trim() } });
    return `${update[2]} ${update[1] === "edit" ? "modifié" : "résolu"}.`;
  }
  return "Commande invalide ou identifiant inconnu. /memory decision|constraint|question TEXTE ; /memory edit|resolve ID TEXTE";
}
