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

import React, { useCallback, useEffect, useMemo } from "react";
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
import { Help } from "../overlays/Help.tsx";
import { createStore, type Store } from "./store.ts";
import { createLiveProducer, MODEL } from "../producer/runtime.ts";
import type { Producer } from "../producer/index.ts";
import type { Option } from "./state.ts";

/** How many conversation lines stay on screen. The rest scrolls. */
const VISIBLE = 16;

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

  // The store and the producer exist once, for the life of the process. They are
  // built outside the render body on purpose: a producer is not a value, and
  // rebuilding one per frame would mint a new session per keystroke.
  const wired = useMemo(() => wire(props), [props.store, props.producer, props.cwd]);
  const { store, producer, missing } = wired;
  const state = useSurface(store);

  /** The only path from a component to a decision. */
  const send = useCallback((control: Control) => store.send(control), [store]);
  const submit = useCallback((text: string) => producer?.say(text), [producer]);

  // Enter submits the composer as a turn. This is the whole input contract, and
  // it is here rather than in a component so that a component never sees a turn
  // at all.
  useInput((input, key) => {
    if (key.escape) return send({ type: "close" });
    if (key.upArrow && state.overlay === "none") return send({ type: "open", overlay: "help" });
    if (input === "?" && state.composer === "") return send({ type: "open", overlay: "help" });
  });

  // The cursor sits in the composer, so Ink must not draw one elsewhere. This is
  // the one place the surface touches the terminal directly, and it restores what
  // it found on unmount, because a TUI that leaves the cursor hidden makes the
  // shell unusable afterwards and a person remembers that once.
  useEffect(() => {
    stdout.write("?25l");
    return () => {
      stdout.write("?25h");
    };
  }, [stdout]);

  // One width, computed once and passed down. Three components each deciding
  // their own rule width is how a header ends up wider than the status bar, which
  // is the most visible way a terminal layout looks unfinished.
  const column = SHELL_RULE_WIDTH(stdout.columns);

  return (
    <Box flexDirection="column" width={column}>
      <Header width={column} project={state.project} busy={state.busy} model={producer ? MODEL : "no model"} />

      <Box flexDirection="column" flexGrow={1} paddingTop={1} paddingBottom={1}>
        {missing ? (
          <Notice text={missing} />
        ) : state.overlay === "projects" ? (
          <Projects
            choices={state.choices}
            onChoose={(option) => producer?.choose(option)}
            onDismiss={() => send({ type: "close" })}
          />
        ) : state.overlay === "inspect" ? (
          <Inspect lines={state.log} />
        ) : state.overlay === "help" ? (
          <Help onClose={() => send({ type: "close" })} />
        ) : (
          <Timeline width={column} entries={state.entries} visible={VISIBLE} />
        )}
      </Box>

      <Composer
        width={column}
        placeholder={state.entries.length === 0 ? undefined : " "}
        value={state.composer}
        onChange={(text) => send({ type: "compose", text })}
        onSubmit={submit}
        onQuit={() => exit()}
        onPalette={() => send({ type: "open", overlay: "palette" })}
        onHelp={() => send({ type: "open", overlay: "help" })}
        onInspect={() => send({ type: "open", overlay: "inspect" })}
        disabled={!producer}
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
function wire(props: AppProps): { store: Store; producer: Producer | null; missing: string | null } {
  const store = props.store ?? createStore();
  if (props.producer) return { store, producer: props.producer, missing: null };
  const cwd = props.cwd ?? process.cwd();
  const live = createLiveProducer(store, cwd);
  if ("missing" in live) {
    return {
      store,
      producer: null,
      missing: live.missing,
    };
  }
  return { store, producer: live.producer, missing: null };
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
  Math.max(48, Math.min(columns ?? 100, 120));

export type { SurfaceState, Option };