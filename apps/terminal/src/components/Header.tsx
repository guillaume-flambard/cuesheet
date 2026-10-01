/**
 * The header: name, project, and one word for the state.
 *
 * Three fields, plus the model when one is present. Not a row of chips. A header
 * that carries more than the person needs is a header they learn to skip, and
 * the things it was carrying belong to `/inspect` anyway.
 *
 * The model name is the one addition over V1, and it earns its place: this
 * surface now runs a real agent, so which agent answered is a fact a person
 * checking the work has a right to know. It shows as "no model" when there is
 * none, because a header that says nothing about a missing model is hiding the
 * reason the surface is inert.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";

export function Header(props: {
  width: number;
  project: string | null;
  busy: boolean;
  model: string;
}): JSX.Element {
  const rule = inkColor(theme.rule);
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box justifyContent="space-between">
        <Text color={inkColor(theme.brand)} bold>cuesheet</Text>
        <Text wrap="truncate-middle" color={inkColor(theme.dim)}>{props.project ?? "no project"}</Text>
        <Text color={inkColor(props.busy ? theme.active : theme.confirmed)}>
          {props.busy ? `${glyph.active} working` : `${glyph.confirmed} ready`}
        </Text>
      </Box>
      <Text wrap="truncate-end" color={rule}>{props.model}</Text>
      <Text color={rule}>{"─".repeat(props.width)}</Text>
    </Box>
  );
}
