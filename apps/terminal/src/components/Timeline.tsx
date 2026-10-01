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
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, measureElement, type DOMElement } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import type { Entry, Certainty } from "../app/state.ts";

const colorFor = (c: Certainty): string =>
  inkColor(c === "confirmed" ? theme.confirmed : c === "active" ? theme.active : c === "failed" ? theme.failed : theme.unknown);
const markFor = (c: Certainty): string =>
  c === "confirmed" ? glyph.confirmed : c === "active" ? glyph.active : c === "failed" ? glyph.failed : glyph.unknown;

export function Timeline({ width, entries, visible, rows }: { width: number; entries: readonly Entry[]; visible: number; rows?: number }): JSX.Element {
  const content = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);
  const [offset, setOffset] = useState(0);
  const viewport = Math.max(1, (rows ?? visible) - 1);
  const maximum = Math.max(0, height - viewport);
  useEffect(() => {
    if (!content.current) return;
    const next = measureElement(content.current).height;
    setOffset((old) => old ? Math.min(Math.max(0, next - viewport), Math.max(0, old + next - height)) : 0);
    setHeight(next);
  }, [entries, width, viewport]);
  useInput((_input, key) => {
    if (key.pageUp) setOffset((old) => Math.min(maximum, old + Math.max(1, viewport - 1)));
    if (key.pageDown) setOffset((old) => Math.max(0, old - Math.max(1, viewport - 1)));
  });
  return (
    <Box width={width} height={rows} flexDirection="column" flexShrink={0}>
      <Box height={viewport} overflow="hidden" flexDirection="column" justifyContent="flex-end" flexShrink={0}>
        <Box ref={content} flexDirection="column" flexShrink={0} marginBottom={-Math.min(offset, maximum)}>
          {entries.map((e, i) => <Line key={i} entry={e} />)}
        </Box>
      </Box>
      <Text wrap="truncate-end" color={inkColor(theme.faint)}>{offset ? "Historique · Pg↓ pour revenir" : "Pg↑ historique · ↑ messages"}</Text>
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
