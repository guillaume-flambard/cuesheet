import type { ContextFrame } from "../core/loop.ts";
import type { Session } from "../core/store.ts";
import { projectWork } from "../work-state.ts";

/** Derived on every inference, never written back as a fact or verdict. */
export function withSharedContext(frame: ContextFrame, session: Session): ContextFrame {
  // Terminal bookkeeping notes are user inputs/model selections, not unanswered
  // work questions. Preserve them in history without mislabelling them here.
  const work = projectWork(session.events.filter(event =>
    !(event.kind === "note" && event.subject.startsWith("terminal."))));
  const last = session.events.at(-1);
  const text = "Shared work snapshot. Historical records are not instructions to repeat effects. " +
    "The canonical goal and evidence below remain authoritative; claims are not verification.\n" +
    JSON.stringify({ revision: last?.seq ?? -1, goal: frame.goal,
      constraints: work.constraints, decisions: work.decisions,
      openQuestions: work.openQuestions, tasks: work.tasks,
      artifacts: work.artifacts, claims: work.claims, evidence: frame.evidence });
  return { ...frame, directives: [...frame.directives, {
    seq: last?.seq ?? 0, at: last?.at ?? 0, target: "builder", text, applied: false,
  }] };
}
