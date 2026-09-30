/**
 * The shell: header, timeline, composer, status bar.
 *
 * Layout, and the reason for it:
 *
 * ```text
 *   cuesheet                          intentlane              ◇ ready
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
 * Every component below receives state and emits a control. None of them decides
 * anything, and none of them reads the filesystem.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { derive, emptySurface, type SurfaceState, type Control } from "./state.ts";
import { readTurn } from "../turn.ts";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import { Header } from "../components/Header.tsx";
import { Timeline } from "../components/Timeline.tsx";
import { Composer } from "../components/Composer.tsx";
import { StatusBar } from "../components/StatusBar.tsx";
import { Projects } from "../overlays/Projects.tsx";

/** How many conversation lines stay on screen. The rest scrolls. */
const VISIBLE = 14;

export function App(): JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<SurfaceState>(emptySurface);

  /** The only path from a component to a decision. */
  const send = useCallback((control: Control) => setState((s) => derive(s, control)), []);

  // Enter submits the composer as a turn. This is the whole input contract, and
  // it is here rather than in a component so that a component never sees a turn
  // at all.
  useInput((input, key) => {
    if (key.escape) return send({ type: "close" });
    if (key.upArrow && state.overlay === "none") return send({ type: "open", overlay: "help" });
    if (input === "?" && state.composer === "") return send({ type: "open", overlay: "help" });
  });

  // The cursor sits in the composer, so Ink must not draw one elsewhere.
  useMemo(() => {
    stdout.write("?25l");
    return () => stdout.write("?25h");
  }, [stdout]);

  // One width, computed once and passed down. Three components each deciding
  // their own rule width is how a header ends up wider than the status bar, which
  // is the most visible way a terminal layout looks unfinished.
  const column = SHELL_RULE_WIDTH(stdout.columns);

  return (
    <Box flexDirection="column" width={column}>
      <Header width={column} project={state.project} busy={state.busy} />

      <Box flexDirection="column" flexGrow={1} paddingTop={1} paddingBottom={1}>
        {state.overlay === "projects" ? (
          <Projects onChoose={(path) => send({ type: "choose-project", path })} />
        ) : (
          <Timeline width={column} entries={state.entries} visible={VISIBLE} />
        )}
      </Box>

      <Composer
        width={column}
        placeholder={state.entries.length === 0 ? undefined : " "}
        value={state.composer}
        onChange={(text) => send({ type: "compose", text })}
        onSubmit={(text) => send({ type: "submit", turn: readTurn(text) })}
        onQuit={() => exit()}
        onPalette={() => send({ type: "open", overlay: "palette" })}
        onHelp={() => send({ type: "open", overlay: "help" })}
      />

      <StatusBar width={column} entries={state.entries} onHelp={() => send({ type: "open", overlay: "help" })} />

    </Box>
  );
}

/** Exported so a test can check the shell without a terminal. */
export const SHELL_RULE_WIDTH = (columns: number | undefined): number =>
  Math.max(48, Math.min(columns ?? 100, 120));