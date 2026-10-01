/**
 * The status line: the smallest honest summary of the session.
 *
 * It reports counts and one state, and nothing else. No path, no branch, no
 * seq, because a status bar that carries facts a person did not ask for becomes
 * a dashboard, and a dashboard is the failure mode this surface was built to
 * avoid.
 *
 * The counts are read off the timeline entries rather than kept in a counter,
 * which is what makes them true by construction: the timeline and the status
 * bar cannot disagree, because one is a function of the other.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import type { Entry } from "../app/state.ts";

export function StatusBar(props: {
  width: number;
  entries: readonly Entry[];
  busy: boolean;
  onHelp(): void;
}): JSX.Element {
  let read = 0;
  let modified = 0;
  let failed = 0;
  for (const e of props.entries) {
    if (e.kind !== "action") continue;
    if (e.label.startsWith("read") && e.detail) read += 1;
    if (e.label.startsWith("edit")) modified += 1;
    if (e.certainty === "failed") failed += 1;
  }
  const right = props.busy ? `${glyph.active} working` : failed > 0 ? `${glyph.failed} ${failed} failed` : "? for help";
  return (
    <Box justifyContent="space-between">
      <Text color={inkColor(theme.faint)}>
        {read} read{modified > 0 ? ` · ${modified} changed` : ""}
      </Text>
      <Text color={inkColor(props.busy ? theme.active : theme.faint)}>{right}</Text>
    </Box>
  );
}