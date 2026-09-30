/**
 * The header: name, project, and one word for the state.
 *
 * Three fields. Not five, and not a row of chips. A header that carries more than
 * the person needs is a header they learn to skip, and the things it was carrying
 * belong to `/inspect` anyway.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";

export function Header({ width, project, busy }: { width: number; project: string | null; busy: boolean }): JSX.Element {
  const rule = inkColor(theme.rule);
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text color={inkColor(theme.brand)} bold>cuesheet</Text>
        <Text color={inkColor(theme.dim)}>{project ?? "no project"}</Text>
        <Text color={inkColor(busy ? theme.active : theme.confirmed)}>
          {busy ? `${glyph.active} working` : `${glyph.confirmed} ready`}
        </Text>
      </Box>
      <Text color={rule}>{"─".repeat(width)}</Text>
    </Box>
  );
}
