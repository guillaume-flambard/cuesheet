/**
 * `/help`: what the surface can do, in four lines.
 *
 * V1's help said "Donne-moi un projet et une tache", which was both a demand and
 * a description of a router that no longer exists. This says what actually
 * happens, which is the only honest way to answer a question about the surface.
 *
 * It does not list the vocabulary. A person who has to learn five nouns to use
 * four sentences is being taught a machine, and the whole premise is that they
 * should not have to.
 */
import React from "react";
import { Box, Text, useInput } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";

export function Help(props: { onClose(): void }): JSX.Element {
  useInput((_input, key) => {
    if (key.escape || key.return) props.onClose();
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={inkColor(theme.dim)}>say what you want. anything.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>  {glyph.confirmed} where you are decides the project</Text>
        <Text>  {glyph.confirmed} the work shows up as it happens</Text>
        <Text>  {glyph.unknown} if two projects match, you pick</Text>
        <Text>  {glyph.confirmed} ⌘I for the log · esc to close</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={inkColor(theme.faint)}>press esc</Text>
      </Box>
    </Box>
  );
}