import type { Event } from "../core/store.ts";
import { projectObjectives } from "./objectives.ts";

/** Historical verification receipts, not a current working tree attestation. */
export function verificationReviewLines(events: readonly Event[], readDiagnostic?: (record:string)=>readonly string[]): string[] {
  const objective=projectObjectives([...events]).current;
  const header=objective
    ? [`Objectif : ${objective.id} · révision ${objective.revision}`]
    : ["Objectif : aucun contrat courant"];
  const checks=events.filter(e=>e.kind==="work_verified").slice(-5);
  if(!checks.length) return [...header,"Aucun résultat de vérification indépendant enregistré.","Un diff ou un test lancé ne constitue pas un succès."];
  const lines=checks.flatMap(event=>{
    const d=event.data;
    const revision=d.objectiveRevision;
    const id=d.objectiveId;
    const target=d.target && typeof d.target==="object" ? d.target as Record<string,unknown> : {};
    const digest=typeof target.artifactDigest==="string" ? target.artifactDigest : "";
    const produced=events.find(e=>e.kind==="work_produced" && e.subject===event.subject &&
      e.seq<event.seq && e.data.artifactDigest===digest && e.data.objectiveId===id &&
      e.data.objectiveRevision===revision);
    const current=objective && objective.id===id && objective.revision===revision;
    const accepted=produced && d.verdict==="VERIFIED" && current &&
      objective?.check?.boundRevision===revision && objective.check.digest===d.checkDigest &&
      target.effectId===event.subject && /^[a-f0-9]{64}$/.test(digest) &&
      typeof d.record==="string" && d.record.length>0;
    const details=Array.isArray(d.evidence) ? d.evidence.slice(0,8).flatMap(item=>{ if(!item || typeof item!=="object") return []; const row=item as Record<string,unknown>; if(!["expected_digest","actual_digest","target_digest","producer_claim_ignored","check_output"].includes(String(row.kind))) return []; const value=typeof row.value==="string" ? row.value.replace(/[\x00-\x1f\x7f-\x9f]/g,"�").slice(0,row.kind==="check_output"?4096:160) : "(absent)"; return row.kind==="check_output" ? ["Sortie du check · diagnostic non fiable, extrait borné",...value.split("\n").slice(0,70)] : [`Mesure ${String(row.kind)} · ${value}`]; }) : [];
    const privateLines = typeof d.record === "string" && readDiagnostic ? readDiagnostic(d.record) : [];
    return [
      `Reçu #${event.seq} · ${accepted?"VÉRIFIÉ HISTORIQUEMENT": "NON VALIDÉ POUR LE CONTRAT ACTUEL"}`,
      `Verdict enregistré : ${String(d.verdict??"UNKNOWN")}${current?"":" · contrat ancien ou inconnu"}`,
      `Artefact : ${digest ? digest.slice(0,16):"digest absent"} · source ${produced?"#"+produced.seq:"introuvable"}`,
      `Check : ${typeof d.checkDigest==="string"?d.checkDigest.slice(0,16):"non attesté"}`,
      ...details,
      ...(privateLines.length ? ["Sortie du check · fichier privé, extrait borné",...privateLines] : []),
      ...(Array.isArray(d.evidence) && d.evidence.length>8 ? ["… autres mesures dans le reçu original."] : []),
      "Attention : la revue n'a pas recalculé le digest du workspace courant.",
    ];
  });
  return [...header,...lines];
}
