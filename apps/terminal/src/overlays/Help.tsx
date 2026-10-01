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
import { theme, inkColor } from "../theme/tokens.ts";

export function Help(props: { onClose(): void }): JSX.Element {
  useInput((_input, key) => {
    if (key.escape || key.return) props.onClose();
  });

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end" color={inkColor(theme.dim)}>Pg↑/↓ : conversation · ↑/↓ : saisie</Text>
      <Text wrap="truncate-end">←/→ : curseur · Ctrl+A/E : début/fin</Text>
      <Text wrap="truncate-end">Ctrl+U : effacer · Esc : retour</Text>
      <Text wrap="truncate-end">Ctrl+C : arrêter ; au repos, quitter</Text>
      <Text wrap="truncate-end">Ctrl+K : commandes · Ctrl+L : journal</Text>
      <Text wrap="truncate-end">/memory : mémoire · /memory decision TEXTE</Text>
    </Box>
  );
}
