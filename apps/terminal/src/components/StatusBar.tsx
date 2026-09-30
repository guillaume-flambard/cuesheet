/**
 * The status line: the smallest honest summary of the session.
 *
 * It reports counts and nothing else. No path, no branch, no model name, because
 * a status bar that carries facts a person did not ask for becomes a dashboard,
 * and a dashboard is the failure mode this surface was built to avoid.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";
import type { Entry } from "../app/state.ts";

export function StatusBar({ width, entries, onHelp }: { width: number; entries: readonly Entry[]; onHelp(): void }): JSX.Element {
  const files = new Set<string>();
  let modified = 0;
  for (const e of entries) {
    if (e.kind !== "action") continue;
    if (e.label.startsWith("read") && e.detail) files.add(e.detail);
    if (e.label.startsWith("wrote")) modified += 1;
  }
  return (
    <Box justifyContent="space-between">
      <Text color={inkColor(theme.faint)}>
        {files.size} files read{modified > 0 ? ` · ${modified} modified` : " · 0 modified"}
      </Text>
      <Text color={inkColor(theme.faint)}>{"? for help"}</Text>
    </Box>
  );
}
