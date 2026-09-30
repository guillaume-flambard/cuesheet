/**
 * Core: the event store, and the session it makes possible.
 *
 * This is the primitive the whole project rests on, and the reason it exists at
 * all. A conversation is a rendering of a state, not the state itself: today an
 * agent session dies with its process, and everything it learned dies with it.
 * Here, an append-only log of events is the state. The transcript, the
 * transcript of the language model included, is a projection that can be
 * rebuilt and thrown away.
 *
 * The design commitment that follows from that: the log is append-only and the
 * store performs no I/O, exactly like the ownership and capability cores. A
 * caller supplies the event list, the store folds it into a Session, and the
 * caller persists it however it likes. That keeps the whole thing testable
 * without a machine and without a clock, and it means the storage engine is an
 * adapter matter, decided later on evidence rather than now.
 *
 * It is called an event store and not a database on purpose. SQLite arrives
 * when a replay measurement justifies it, and not before.
 */

/** Something that happened, once, and can never be contradicted. */
export interface Event {
  /** Monotonic within a session, assigned by appendEvent, stable forever. */
  seq: number;
  /** Wall clock at append time. Injected, never read from Date inside. */
  at: number;
  /**
   * What kind of thing happened. A closed vocabulary, because every consumer
   * switches on it: goal, capability, directive, observation, action, evidence,
   * model, note.
   */
  kind: EventKind;
  /** The subject the event is about, e.g. an agent id or a capability name. */
  subject: string;
  /** Facts carried by the event. Shape is per-kind, and the core ignores it. */
  data: Record<string, unknown>;
}

export type EventKind =
  | "goal"
  | "capability"
  | "directive"
  | "observation"
  | "action"
  | "evidence"
  | "model"
  | "note"
  | // An effect the world was asked to perform. Recording the request is not
    // recording its outcome, and the two must never be the same fact: the whole
    // point of an id here is that a request can be observed, or never observed,
    // and those are three states rather than two.
    "effect_requested"
  | // What the world answered about one effect. Carries the id of the request
    // it answers, so a crash between the two leaves an unanswered request
    // rather than a guess.
    "effect_observed";

/**
 * Every kind, as a value.
 *
 * The union above is what a consumer switches on. This is the same list as a
 * value, so a projection or a validator can enumerate it without restating it
 * and drifting from the definition.
 */
export const EVENT_KINDS_OF_STORE = [
  "goal",
  "capability",
  "directive",
  "observation",
  "action",
  "evidence",
  "model",
  "note",
  "effect_requested",
  "effect_observed",
] as const satisfies readonly EventKind[];

/** A thing being appended, before the store has given it a sequence. */
export type NewEvent = Omit<Event, "seq" | "at"> & { at?: number };

/** A goal, as reconstructed from the events that mention it. */
export interface Goal {
  subject: string;
  text: string;
  at: number;
  /** False once a later event of kind evidence closes it. */
  open: boolean;
}

/** A directive addressed to a subject, such as an agent. */
export interface Directive {
  seq: number;
  at: number;
  target: string;
  text: string;
  /**
   * True when a later event carries an acknowledgement for this directive.
   * The difference between sent and applied is the whole point of a control
   * plane, so it is reconstructed rather than assumed.
   */
  applied: boolean;
}

/** A piece of evidence, attached to whatever it proves. */
export interface Evidence {
  seq: number;
  at: number;
  subject: string;
  claim: string;
  /** What backs the claim. Empty is legitimate, and is the point. */
  backing: string;
}

/** The model bound to a subject at a point in time. */
export interface ModelBinding {
  subject: string;
  model: string;
  at: number;
}

export interface Session {
  id: string;
  goal: Goal | null;
  /** Every event, in append order. The session IS this list. */
  events: Event[];
  directives: Directive[];
  evidence: Evidence[];
  /** Latest model per subject. A switch is a new binding, not a new session. */
  models: Map<string, ModelBinding>;
  /** Latest known capabilities, by name, with the version last seen. */
  capabilities: Map<string, { version: string; at: number }>;
  openDirectives: Directive[];
}

export class EventStore {
  readonly id: string;
  private readonly now: () => number;
  private readonly events: Event[] = [];
  private nextSeq = 1;

  // Parameter properties are avoided on purpose: this project runs under
  // Node's strip-only TypeScript mode, which does not support them, and the
  // rest of the core writes fields explicitly for the same reason.
  constructor(id: string, now: () => number) {
    this.id = id;
    this.now = now;
  }

  /**
   * Append one event. A caller supplies `at` when replaying historical data and
   * omits it when recording live, so that a replay is bit-identical to the
   * original. Events are never mutated and never removed; a mistake is
   * corrected by appending an event that says so.
   */
  append(event: NewEvent): Event {
    const stamped: Event = {
      ...event,
      seq: this.nextSeq++,
      at: event.at ?? this.now(),
    };
    this.events.push(stamped);
    return stamped;
  }

  /**
   * Fold the log into a session. The log is the truth, so this is a pure
   * projection: calling it twice on the same log gives the same session, and
   * adding events earlier in the sequence changes nothing about how later ones
   * are read, because a projection only ever moves forward.
   */
  toSession(): Session {
    let goal: Goal | null = null;
    const directives = new Map<number, Directive>();
    const acknowledgements = new Set<number>();
    const evidence: Evidence[] = [];
    const models = new Map<string, ModelBinding>();
    const capabilities = new Map<string, { version: string; at: number }>();

    for (const event of this.events) {
      switch (event.kind) {
        case "goal": {
          goal = {
            subject: event.subject,
            text: String(event.data.text ?? ""),
            at: event.at,
            open: true,
          };
          break;
        }
        case "directive": {
          directives.set(event.seq, {
            seq: event.seq,
            at: event.at,
            target: event.subject,
            text: String(event.data.text ?? ""),
            applied: false,
          });
          break;
        }
        case "note": {
          // The acknowledgement of a directive is a note naming its sequence.
          const ack = event.data.acknowledges;
          if (typeof ack === "number") {
            acknowledgements.add(ack);
          }
          break;
        }
        case "evidence": {
          evidence.push({
            seq: event.seq,
            at: event.at,
            subject: event.subject,
            claim: String(event.data.claim ?? ""),
            backing: String(event.data.backing ?? ""),
          });
          // Evidence about the goal closes it, which is the only way a goal
          // is ever closed. An agent claiming completion appends nothing.
          if (goal && event.subject === goal.subject) {
            goal = { ...goal, open: false };
          }
          break;
        }
        case "model": {
          models.set(event.subject, {
            subject: event.subject,
            model: String(event.data.model ?? ""),
            at: event.at,
          });
          break;
        }
        case "capability": {
          capabilities.set(event.subject, {
            version: String(event.data.version ?? ""),
            at: event.at,
          });
          break;
        }
        default:
          // observation, action, and anything added later stay in the log and
          // are not projected yet. Keeping them here rather than dropping them
          // is deliberate: a consumer that needs them should be able to read
          // the events rather than finding them already discarded.
          break;
      }
    }

    for (const seq of acknowledgements) {
      const directive = directives.get(seq);
      if (directive) {
        directive.applied = true;
      }
    }

    return {
      id: this.id,
      goal,
      events: [...this.events],
      directives: [...directives.values()],
      evidence,
      models,
      capabilities,
      openDirectives: [...directives.values()].filter((d) => !d.applied),
    };
  }
}
