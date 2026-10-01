/**
 * The conversation, and the only part that grows.
 *
 * Actions are objects rather than paragraphs, because a log line is a fact about
 * the harness and an object is a fact about the work. "✓ Read  router.ts" is
 * short enough to scan without reading, which a paragraph of the same information
 * is not.
 *
 * The status block is what this surface can do that a log cannot: it shows that
 * the work exists, that the artifact was recovered, and that the completion of the
 * producer is unknown. Three different certainties, side by side, in words a
 * person can act on.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import type { Entry, Certainty } from "../app/state.ts";

const colorFor = (c: Certainty): string =>
  inkColor(c === "confirmed" ? theme.confirmed : c === "active" ? theme.active : c === "failed" ? theme.failed : theme.unknown);
const markFor = (c: Certainty): string =>
  c === "confirmed" ? glyph.confirmed : c === "active" ? glyph.active : c === "failed" ? glyph.failed : glyph.unknown;

export function Timeline({ width, entries, visible, rows }: { width: number; entries: readonly Entry[]; visible: number; rows?: number }): JSX.Element {
  // The newest line is always visible. A conversation whose latest word is
  // off-screen is a conversation that has already lost the person.
  const shown = entries.slice(-visible);
  return (
    <Box width={width} height={rows} overflow="hidden" flexDirection="column" justifyContent="flex-end" flexShrink={0}>
      {shown.map((e, i) => (
        <Line key={i} entry={e} />
      ))}
    </Box>
  );
}

function Line({ entry }: { entry: Entry }): JSX.Element {
  switch (entry.kind) {
    case "you":
      return (
        <Box marginTop={1} flexShrink={0}>
          <Text color={inkColor(theme.dim)}>  you  </Text>
          <Text>{entry.text}</Text>
        </Box>
      );
    case "cuesheet":
      return (
        <Box marginTop={1} flexShrink={0}>
          <Text color={inkColor(theme.brand)}>  cs   </Text>
          <Text>{entry.text}</Text>
        </Box>
      );
    case "action":
      return (
        <Box flexShrink={0}>
          <Text color={colorFor(entry.certainty)}>  {markFor(entry.certainty)} </Text>
          <Text color={inkColor(theme.dim)}>{entry.label.padEnd(10)}</Text>
          <Text color={inkColor(theme.faint)}>{entry.detail ?? ""}</Text>
        </Box>
      );
    case "status":
      return (
        <Box flexShrink={0}>
          <Text color={inkColor(theme.faint)}>    {entry.label.padEnd(12)}</Text>
          <Text color={colorFor(entry.certainty)}>{markFor(entry.certainty)} {entry.value}</Text>
        </Box>
      );
    case "failure":
      return (
        <Box flexShrink={0}>
          <Text color={inkColor(theme.failed)}>  {glyph.failed} </Text>
          <Text color={inkColor(theme.failed)}>{entry.text}</Text>
        </Box>
      );
  }
}
