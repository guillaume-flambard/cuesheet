import type { Event, EventStore } from "../core/store.ts";

export const MEMORY_SUBJECT = "terminal.memory";
export type MemoryKind = "decision" | "constraint" | "question";
export interface WorkMemory {
  id: string; kind: MemoryKind; text: string; active: boolean;
  created: number; revision: number; by: string;
  rationale?: string; sources?: number[];
}

export function projectMemory(events: readonly Event[]): WorkMemory[] {
  const items = new Map<string, WorkMemory>();
  for (const event of events) {
    if (event.kind !== "note" || event.subject !== MEMORY_SUBJECT) continue;
    const { operation, text, id, kind } = event.data;
    if (typeof text !== "string" || !text.trim()) continue;
    const provenance = { by: event.data.author === "model" ? "model" : "human",
      rationale: typeof event.data.rationale === "string" ? event.data.rationale : undefined,
      sources: Array.isArray(event.data.sources) ? event.data.sources.filter((source): source is number => typeof source === "number") : undefined };
    if (operation === "create" && (kind === "decision" || kind === "constraint" || kind === "question")) {
      const key = `m-${event.seq}`;
      items.set(key, { id: key, kind, text, active: true, created: event.seq, revision: event.seq, ...provenance });
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
