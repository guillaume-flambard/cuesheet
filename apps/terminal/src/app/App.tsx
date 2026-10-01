/**
 * The shell: header, timeline, composer, status bar.
 *
 * Layout, and the reason for it:
 *
 * ```text
 *   cuesheet                          cuesheet              ◇ ready
 *   ────────────────────────────────────────────────────────────────────
 *
 *   ( conversation, scrolling, the only part that grows )
 *
 *   ────────────────────────────────────────────────────────────────────
 *   › _
 *   ────────────────────────────────────────────────────────────────────
 *   3 files · 0 modified                                       ⌘K palette
 * ```
 *
 * Two rules that decided the shape:
 *
 * 1. The composer is permanent and always at the bottom. An interface that hides
 *    the place you type in, or that puts it at the top of a growing log, is a log
 *    with a text field in it.
 *
 * 2. One frame. Not a dashboard of panels: a column, with two hairlines and a
 *    status line. The temptation in a terminal is always to fill the space, and
 *    filling the space is how this becomes fifteen boxes.
 *
 * ## What changed in V2
 *
 * The state moved out of `useState` and into a store the producer owns
 * (`app/store.ts`), read here through `useSyncExternalStore`. The reason is
 * mechanical: the loop's `onEvent` fires from a promise continuation outside
 * React, so a reducer driven by a keypress callback cannot represent a streaming
 * run.
 *
 * And `submit` no longer carries a `TurnIntent`. It carries the sentence. There
 * is no classifier between the composer and the producer, so there is no phrase
 * that can produce "name a project", and no branch that can answer a sentence
 * before anybody has tried to do the work.
 *
 * Every component below receives state and emits a control. None of them decides
 * anything, and none of them reads the filesystem.
 */

import React, { useCallback, useMemo, useEffect, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useSurface } from "./store.ts";
import type { Control, SurfaceState } from "./state.ts";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import { Header } from "../components/Header.tsx";
import { Timeline } from "../components/Timeline.tsx";
import { Composer } from "../components/Composer.tsx";
import { StatusBar } from "../components/StatusBar.tsx";
import { Projects } from "../overlays/Projects.tsx";
import { Inspect } from "../overlays/Inspect.tsx";
import { Palette } from "../overlays/Palette.tsx";
import { Help } from "../overlays/Help.tsx";
import { createStore, type Store } from "./store.ts";
import { Models } from "../overlays/Models.tsx";
import { listModels } from "../../../../src/adapters/model-catalog.ts";
import type { ModelBinding } from "../../../../src/adapters/model-binding.ts";
import { Sessions } from "../overlays/Sessions.tsx";
import { listTerminalSessions, type TerminalSession } from "../../../../src/adapters/terminal-session.ts";
import { createLiveProducer, createTerminalRuntime } from "../producer/runtime.ts";
import type { Producer } from "../producer/index.ts";
import type { Option } from "./state.ts";

export interface AppProps {
  /**
   * Injected so a test can drive the whole shell headlessly.
   *
   * Omitted in production, where the real adapters are built and, when there is
   * no provider key, the reason is shown in the timeline instead of a run that
   * cannot finish.
   */
  readonly store?: Store;
  readonly producer?: Producer;
  /** Overrides the working directory. A test never reads the real machine. */
  readonly cwd?: string;
}

export function App(props: AppProps): JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [, resized] = useState(0);
  useEffect(() => {
    const resize = () => resized((n) => n + 1);
    stdout.on("resize", resize);
    return () => { stdout.off("resize", resize); };
  }, [stdout]);

  // The store and the producer exist once, for the life of the process. They are
  // built outside the render body on purpose: a producer is not a value, and
  // rebuilding one per frame would mint a new session per keystroke.
  const initial = useMemo(() => wire(props), [props.store, props.producer, props.cwd]);
  const [replacement,setReplacement]=useState<ReturnType<typeof wire> | null>(null);
  const wired=replacement ?? initial;
  useEffect(()=>()=>wired.session?.close(),[wired]);
  const { store, producer, binding } = wired;
  const [, changedModel] = useState(0);
  const missing = binding ? binding.missing : wired.missing;
  const modelName = binding ? binding.label : wired.modelName;
  const state = useSurface(store);

  /** The only path from a component to a decision. */
  const send = useCallback((control: Control) => store.send(control), [store]);
  const submit = useCallback((text: string) => {
    if (missing) { store.send({ type: "submit", text }); return; }
    producer?.say(text);
  }, [producer, missing, store]);
  const catalog = useCallback((choice: Parameters<typeof listModels>[0], signal: AbortSignal) => listModels(choice, { signal }), []);

  const sessionChoices=useCallback(()=>listTerminalSessions(),[]);
  const loadSession=(id?:string)=>{
    if(store.get().busy) {store.send({type:"observed",entries:[{kind:"failure",text:"Un travail est en cours. Interromps-le avant de changer de session."}]});store.send({type:"close"});return;}
    if(id===wired.session?.metadata.id) {store.send({type:"close"});return;}
    const next=wire({...props,cwd:wired.session?.metadata.cwd ?? props.cwd,store:undefined,producer:undefined},id ?? null);
    if(next.missing && !next.producer) {store.send({type:"observed",entries:[{kind:"failure",text:next.missing}]});store.send({type:"close"});return;}
    setReplacement(next);
  };

  // Enter submits the composer as a turn. This is the whole input contract, and
  // it is here rather than in a component so that a component never sees a turn
  // at all.
  useInput((input, key) => {
    if (key.escape) return send({ type: "close" });
    if (input === "?" && state.composer === "" && state.overlay === "none") return send({ type: "open", overlay: "help" });
  });

  // One width, computed once and passed down. Three components each deciding
  // their own rule width is how a header ends up wider than the status bar, which
  // is the most visible way a terminal layout looks unfinished.
  const column = SHELL_RULE_WIDTH(stdout.columns);
  const rows = Math.max(8, stdout.rows ?? 24);
  const contentRows = Math.max(1, rows - 9);

  return (
    <Box flexDirection="column" width={column} height={rows - 1} overflow="hidden">
      <Header
        width={column}
        project={state.project}
        busy={state.busy}
        model={producer ? modelName : "no model"}
      />

      <Box flexDirection="column" flexGrow={1} flexShrink={0} height={contentRows + 2} overflow="hidden" paddingTop={1} paddingBottom={1}>
        {state.overlay === "models" && binding ? (
          <Models selection={binding.selection} rows={contentRows} busy={state.busy} list={catalog}
            apply={(choice, save) => {
              const result = binding.select(choice, { save, busy: store.get().busy, beforeCommit:selection=>producer?.modelSelected?.(selection) });
              if ("ok" in result) {
                changedModel(value => value + 1);
                store.send({ type: "observed", entries: [{ kind: "status", label: "modèle", value: `${binding.label}${store.get().busy ? " · sélectionné pour la suite" : ""}${save && !result.warning ? " · préférence sauvegardée" : " · cette session"}`, certainty: "confirmed" }] });
                if(result.warning)store.send({type:"observed",entries:[{kind:"status",label:"préférence",value:result.warning,certainty:"unknown"}]});
                store.send({ type: "logged", line: `[model-selected] ${JSON.stringify(binding.selection)} saved=${save}` });
              }
              return result;
            }} onClose={() => send({ type: "close" })} />
        ) : state.overlay === "palette" ? (
          <Palette rows={contentRows} onOpen={(overlay) => send({ type: "open", overlay })}
            onNew={()=>loadSession()} onResume={()=>{send({type:"close"});if(!missing) producer?.resume?.();}} />
        ) : state.overlay === "sessions" ? (
          <Sessions rows={contentRows} current={wired.session?.metadata.id} list={sessionChoices} onChoose={loadSession} />
        ) : missing ? (
          <Notice text={missing} />
        ) : state.overlay === "projects" ? (
          <Projects
            choices={state.choices}
            onChoose={(option) => producer?.choose(option)}
            onDismiss={() => send({ type: "close" })}
          />
        ) : state.overlay === "inspect" ? (
          <Inspect lines={state.log} width={column} maxLines={Math.max(1, contentRows - 2)} />
        ) : state.overlay === "help" ? (
          <Help onClose={() => send({ type: "close" })} />
        ) : (
          <Timeline width={column} entries={state.entries} visible={contentRows} rows={contentRows} />
        )}
      </Box>

      <Composer
        width={column}
        placeholder={state.entries.length === 0 ? undefined : " "}
        value={state.composer}
        onChange={(text) => send({ type: "compose", text })}
        onSubmit={submit}
        onQuit={() => state.busy ? producer?.cancel?.() : exit()}
        onPalette={() => send({ type: "open", overlay: "palette" })}
        onHelp={() => send({ type: "open", overlay: "help" })}
        onInspect={() => send({ type: "open", overlay: "inspect" })}
        active={state.overlay === "none"}
        disabled={!producer || !!missing}
        history={state.entries.flatMap((entry) => entry.kind === "you" ? [entry.text] : [])}
      />

      <StatusBar
        width={column}
        entries={state.entries}
        busy={state.busy}
        onHelp={() => send({ type: "open", overlay: "help" })}
      />
    </Box>
  );
}

/**
 * Build the store, the producer, or the reason there is no producer.
 *
 * A missing provider is reported once, in the timeline, in the surface's own
 * words. It is not an error banner and it is not an exit code: the surface still
 * runs, still resolves the portfolio, and still explains itself, because a person
 * who typed `cuesheet` did not ask for a stack trace about a missing variable.
 */
function wire(props: AppProps, sessionId?:string | null): {
  store: Store;
  producer: Producer | null;
  missing: string | null;
  /**
   * What the header calls the model.
   *
   * Resolved where the producer is built rather than in the render body, so the
   * header and the producer cannot name two different models. A header reading
   * one transport while the loop runs another is a lie a person cannot detect
   * from the screen, and this surface is the one place that claim is made.
   */
  modelName: string;
  binding?: ModelBinding;
  session?: TerminalSession;
} {
  const store = props.store ?? createStore();
  // A test that supplies its own producer is not running a model at all, so it
  // has no model to name. "test" is honest where a provider id would be a guess.
  if (props.producer) return { store, producer: props.producer, missing: null, modelName: "test" };
  const cwd = props.cwd ?? process.cwd();
  if (!props.store) {
    const live=createTerminalRuntime(cwd,sessionId === null ? undefined : sessionId ?? process.env.CUESHEET_SESSION);
    if("missing" in live) return {store,producer:null,missing:live.missing,modelName:"no model"};
    return {store:live.store,producer:live.producer,binding:live.binding,session:live.session,missing:null,modelName:live.binding.label};
  }
  const live = createLiveProducer(store, cwd);
  if ("missing" in live) {
    return {
      store,
      producer: null,
      missing: live.missing,
      modelName: "no model",
    };
  }
  return { store, producer: live.producer, binding: live.binding, missing: null, modelName: live.binding.label };
}

/** The one line that replaces the timeline when there is nothing to run with. */
function Notice({ text }: { text: string }): JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={inkColor(theme.failed)}>  {glyph.failed} </Text>
      <Text>{text}</Text>
    </Box>
  );
}

/** Exported so a test can check the shell without a terminal. */
export const SHELL_RULE_WIDTH = (columns: number | undefined): number =>
  Math.max(1, Math.min(columns ?? 100, 120));

export type { SurfaceState, Option };
