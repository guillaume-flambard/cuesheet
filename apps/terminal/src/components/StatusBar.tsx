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
  notifications?:number;
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
  // A count of zero is not a fact a person asked for, it is the absence of one.
  // `modified` was already conditional and `read` was not, so the status bar
  // reported "0 read" on every quiet session, which says nothing and reads like
  // an internal metric. Every count is now conditional for the same reason.
  const parts: string[] = [];
  if (read > 0) parts.push(`${read} read`);
  if (props.notifications) parts.push(`${props.notifications} notification(s)`);
  if (modified > 0) parts.push(`${modified} changed`);
  return (
    <Box justifyContent="space-between" flexShrink={0}>
      <Text color={inkColor(theme.faint)}>{parts.join(" · ")}</Text>
      <Text color={inkColor(props.busy ? theme.active : theme.faint)}>{right}</Text>
    </Box>
  );
}
