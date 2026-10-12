import React from "react";
import { Box, Text } from "ink";
import type { WorkFocus as Focus } from "./work-focus.ts";
import { theme, inkColor } from "../theme/tokens.ts";

const colors = {
  confirmed: theme.dim,
  active: theme.active,
  unknown: theme.unknown,
  failed: theme.failed,
} as const;

/** One quiet, fixed-height overview; no side effects or direct runtime access. */
export function WorkFocus({ focus, width, compact }: {
  focus: Focus;
  width: number;
  compact: boolean;
}): JSX.Element {
  return (
    <Box flexDirection="column" width={width} flexShrink={0} height={compact ? 2 : 3} overflow="hidden">
      {!compact && (
        <Text wrap="truncate-end" color={inkColor(theme.dim)} bold>
          {focus.heading}
        </Text>
      )}
      <Text wrap="truncate-end" color={inkColor(theme.text)}>
        {focus.request === null
          ? (compact ? "Bienvenue · décris ton prochain travail" : "Une demande, un travail, des faits.")
          : `${compact ? "Demande" : "Ta demande"} · ${focus.request}`}
      </Text>
      <Text wrap="truncate-end" color={inkColor(colors[focus.tone])}>
        {focus.detail}
      </Text>
    </Box>
  );
}
