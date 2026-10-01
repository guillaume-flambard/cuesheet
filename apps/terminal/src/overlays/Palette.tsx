import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";

const commands = [
  { label: "View the log", overlay: "inspect" },
  { label: "Help", overlay: "help" },
  { label: "Provider et modèle", overlay: "models" },
] as const;

export function Palette(props: { onOpen(overlay: "inspect" | "help" | "models"): void }): JSX.Element {
  const [at, setAt] = useState(0);
  useInput((_input, key) => {
    if (key.downArrow) setAt((i) => Math.min(i + 1, commands.length - 1));
    if (key.upArrow) setAt((i) => Math.max(i - 1, 0));
    if (key.return) props.onOpen(commands[at]!.overlay);
  });
  return <Box flexDirection="column">
    <Text color={inkColor(theme.dim)}>Commands</Text>
    {commands.map((command, i) => <Text key={command.overlay} color={inkColor(i === at ? theme.brand : theme.dim)}>
      {i === at ? "> " : "  "}{command.label}
    </Text>)}
    <Text color={inkColor(theme.faint)}>↑↓ to move · enter to open · esc to close</Text>
  </Box>;
}
