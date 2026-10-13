/**
 * A glanceable work summary derived solely from existing human-facing entries.
 * Never infer a goal, verified result, or successful effect from a model claim.
 * The full timeline remains authoritative and independently navigable.
 */
import type { Certainty, Entry } from "../app/state.ts";

export interface WorkFocus {
  readonly heading: string;
  readonly request: string | null;
  readonly detail: string;
  readonly tone: Certainty;
}

const auxiliary = new Set(["working in", "dossier", "modèle", "préférence", "model", "provider"]);

export function projectWorkFocus(entries: readonly Entry[], busy: boolean): WorkFocus {
  const lastUser = entries.findLastIndex(entry => entry.kind === "you");
  const request = lastUser < 0 ? null : (entries[lastUser] as Extract<Entry, { kind: "you" }>).text;
  const recent = entries.slice(lastUser < 0 ? 0 : lastUser + 1);
  const signal = [...recent].reverse().find(entry => {
    if (entry.kind === "failure") return true;
    if (entry.kind === "action") return true;
    if (entry.kind === "status") return !auxiliary.has(entry.label.toLowerCase());
    return false;
  });

  if (signal?.kind === "failure") return {
    heading: request ? "Dernière demande" : "Travail",
    request, detail: `Erreur · ${signal.text}`, tone: "failed",
  };
  if (signal?.kind === "action" || signal?.kind === "status") {
    const label = signal.kind === "action"
      ? [signal.label, signal.detail].filter(Boolean).join(" · ")
      : [signal.label, signal.value].filter(Boolean).join(" · ");
    const preface = signal.certainty === "active" ? "Action demandée"
      : signal.certainty === "unknown" ? "À vérifier"
      : signal.certainty === "failed" ? "Échec observé" : "Action observée";
    return {
      heading: request ? "Dernière demande" : "Travail",
      request, detail: signal.kind === "status" && signal.label === "réponse"
        ? "Réponse reçue · travail non vérifié"
        : `${preface} · ${label}`, tone: signal.certainty,
    };
  }
  if (request !== null) return {
    heading: "Dernière demande", request,
    detail: busy ? "Travail en cours · en attente d'une observation"
      : "Aucun nouveau fait observé depuis cette demande",
    tone: busy ? "active" : "unknown",
  };
  return {
    heading: "Bienvenue",
    request: null,
    detail: busy ? "Travail en cours · en attente d'une observation"
      : "Décris ce que tu souhaites accomplir. Aucune commande nécessaire.",
    tone: busy ? "active" : "confirmed",
  };
}
