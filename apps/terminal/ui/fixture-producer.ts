/**
 * The deterministic runtime behind `npm run ui:verify`.
 *
 * This is a presentation fixture, and it says so plainly. It drives the REAL
 * application: the real `App`, the real `store` reducer, the real timeline, the
 * real palette, in a real PTY. What it replaces is only the model, because a
 * provider call is not reproducible and Render Proof must be.
 *
 * It is therefore proof about the SURFACE, not about the runtime. The behaviour
 * it shows (world mapping, workers, a Human Delta, a provider failover, live
 * steering, PROVEN) is scripted here. Whether the runtime really produces those
 * states is the business of the ordinary test suite, and no claim is made here
 * that it does.
 *
 * One thing it proves for real: the greeting reply is delivered through
 * `observed` TWICE with one identity, so the surface has to recognise it. If the
 * exactly-once projection regresses, the harness sees two replies in the
 * terminal buffer and fails. That is the one assertion in here that tests
 * production behaviour rather than layout.
 */
import type { Store } from "../src/app/store.ts";
import type { Producer } from "../src/producer/index.ts";
import type { Entry, Option, SurfaceState } from "../src/app/state.ts";

/** One identity per scripted line, fixed so a run is byte identical to the last. */
const name = (n: number): string => `e:fixture:${n}`;

/** A single kind of step, so the scenario reads as a list rather than as code. */
type Step = { readonly when: RegExp; readonly emit: (store: Store) => void };

const say = (store: Store, entries: readonly (Entry | Omit<Entry, "id">)[]): void => {
  store.send({ type: "observed", entries: entries as readonly Entry[] });
};

/**
 * The canonical scenario, keyed on the sentence rather than on a timer.
 *
 * Content-keyed and synchronous on purpose: the harness types a sentence and
 * waits for the effect, so nothing races the clock and the same input always
 * produces the same frame. A scenario driven by `setTimeout` would be a
 * different run on a loaded machine, which is the failure this whole file
 * exists to avoid.
 */
const STEPS: readonly Step[] = [
  {
    when: /^\s*(hello|hi|bonjour|salut)\b/i,
    emit: (store) => {
      // Delivered twice with one identity: the surface must show it once. This
      // exercises the real exactly-once projection inside the real terminal.
      const reply = { id: name(1), kind: "cuesheet" as const, text: "RENDER_PROOF_REPLY Hello. What would you like to work on?" };
      say(store, [reply]);
      say(store, [reply]);
    },
  },
  {
    when: /projets?|projects?|world/i,
    emit: (store) => {
      store.send({ type: "began" });
      say(store, [
        { id: name(10), kind: "status" as const, label: "world", value: "RENDER_PROOF_WORLD 12 projects, 3 relevant", certainty: "confirmed" as const },
        { id: name(11), kind: "action" as const, label: "mapping", detail: "RENDER_PROOF_WORKER resolving project roots", certainty: "active" as const },
        { id: name(12), kind: "action" as const, label: "worker A1", detail: "RENDER_PROOF_WORKER introducing app intents", certainty: "active" as const },
        { id: name(13), kind: "action" as const, label: "worker A2", detail: "RENDER_PROOF_WORKER tracing dependency graph", certainty: "active" as const },
        { id: name(14), kind: "status" as const, label: "finding", value: "RENDER_PROOF_FINDING the custom parameter path may be redundant", certainty: "unknown" as const },
        { id: name(15), kind: "status" as const, label: "human delta", value: "RENDER_PROOF_HUMAN_DELTA one assumption in IntentLane changed", certainty: "active" as const },
        { id: name(16), kind: "status" as const, label: "provider", value: "RENDER_PROOF_FAILOVER nemotron exhausted, switched to glm", certainty: "failed" as const },
      ]);
    },
  },
  {
    when: /kollio|laisse|pause/i,
    emit: (store) => {
      say(store, [
        { id: name(20), kind: "status" as const, label: "steering", value: "RENDER_PROOF_STEERING Kollio paused, others continue", certainty: "active" as const },
        { id: name(21), kind: "action" as const, label: "verify", detail: "RENDER_PROOF_VERIFY running the affected suite", certainty: "active" as const },
        { id: name(22), kind: "status" as const, label: "verdict", value: "RENDER_PROOF_PROVEN", certainty: "confirmed" as const },
      ]);
      store.send({ type: "ended" });
    },
  },
];

export function createFixtureProducer(store: Store): Producer {
  return {
    say(text: string): void {
      const said = text.trim();
      if (!said) return;
      // The real producer records the sentence and clears the composer before it
      // does anything else, so the fixture does the same: the surface behaviour
      // under test is the production one, not a simplified copy of it.
      store.send({ type: "submit", text: said });
      const step = STEPS.find((s) => s.when.test(said));
      if (!step) {
        say(store, [{ id: name(99), kind: "cuesheet" as const, text: `RENDER_PROOF_UNKNOWN no fixture step matched: ${said}` }]);
        return;
      }
      step.emit(store);
    },
    choose(_option: Option): void {
      // Nothing in the canonical scenario offers a choice. Kept total so the
      // interface is honestly implemented rather than partially.
    },
    get state(): SurfaceState {
      return store.get();
    },
  };
}

/** The sentences the harness types, in order. One source for both sides. */
export const SCENARIO_INPUTS: readonly string[] = [
  "hello there",
  "analyse mes projets",
  "laisse Kollio",
];
