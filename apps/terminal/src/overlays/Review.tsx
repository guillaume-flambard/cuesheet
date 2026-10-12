import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { GitReview } from "../../../../src/adapters/git-review.ts";
import { theme, inkColor } from "../theme/tokens.ts";

const EMPTY: GitReview = { kind: "unavailable", reason: "Aucune source de revue disponible." };

export function Review(props: {
  width: number;
  rows: number;
  onLoad(): Promise<GitReview>;
  evidence?: readonly string[];
}): JSX.Element {
  const [review, setReview] = useState<GitReview | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    setReview(null);
    setOffset(0);
    Promise.resolve().then(() => props.onLoad()).then(
      result => { if (mounted) setReview(result); },
      () => { if (mounted) setReview(EMPTY); },
    );
    return () => { mounted = false; };
  }, [props.onLoad, revision]);
  const lines = review?.kind === "observed"
    ? [...(props.evidence??[]), "─── Modifications Git observées (non vérifiées) ───", ...review.lines]
    : [...(props.evidence??[]), ...(review?.kind === "unavailable" ? [review.reason] : [])];
  const viewport = Math.max(1, props.rows - 3);
  const maxOffset = Math.max(0, lines.length - viewport);
  useInput((input, key) => {
    if (key.upArrow) return setOffset(i => Math.max(0, i - 1));
    if (key.downArrow) return setOffset(i => Math.min(maxOffset, i + 1));
    if (key.pageUp) return setOffset(i => Math.max(0, i - viewport));
    if (key.pageDown) return setOffset(i => Math.min(maxOffset, i + viewport));
    if (input.toLowerCase() === "r" && !key.ctrl && !key.meta) setRevision(i => i + 1);
  });

  return (
    <Box flexDirection="column" width={props.width} height={props.rows} overflow="hidden">
      <Text color={inkColor(theme.brand)} bold wrap="truncate-end">Revue des changements · aperçu Git observé</Text>
      <Text color={inkColor(theme.unknown)} wrap="truncate-end">Non vérifié · le workspace peut changer · R actualiser</Text>
      <Box height={viewport} overflow="hidden" flexDirection="column" width={props.width}>
        {review === null ? <Text color={inkColor(theme.dim)}>Lecture du workspace…</Text>
        : review.kind === "unavailable" ? <Text color={inkColor(theme.unknown)} wrap="truncate-end">{review.reason}</Text>
        : lines.slice(offset, offset + viewport).map((line, i) => (
          <Text key={offset + i} wrap="truncate-end"
            color={inkColor(line.startsWith("+") && !line.startsWith("+++") ? theme.confirmed
              : line.startsWith("-") && !line.startsWith("---") ? theme.failed
              : line.startsWith("@@") ? theme.active : theme.dim)}>
            {line || " "}
          </Text>
        ))}
      </Box>
      <Text wrap="truncate-end" color={inkColor(theme.faint)}>↑↓/Pg↑Pg↓ lire · R actualiser · Esc revenir</Text>
    </Box>
  );
}
