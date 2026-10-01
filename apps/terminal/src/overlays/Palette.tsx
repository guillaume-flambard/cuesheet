import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";

const commands = [
  { label: "View the log", overlay: "inspect" },
  { label: "Help", overlay: "help" },
  { label: "Provider et modèle", overlay: "models" },
  { label: "Sessions", overlay: "sessions" },
  { label: "Nouvelle session", overlay: "new" },
  { label: "Reprendre le travail", overlay: "resume" },
] as const;

export function Palette(props: { rows?: number; onOpen(overlay: "inspect" | "help" | "models" | "sessions"): void; onNew?():void; onResume?():void }): JSX.Element {
  const [at, setAt] = useState(0);
  useInput((_input, key) => {
    if (key.downArrow) setAt((i) => Math.min(i + 1, commands.length - 1));
    if (key.upArrow) setAt((i) => Math.max(i - 1, 0));
    if (key.return) {
      const selected=commands[at]!.overlay;
      if(selected==="new") props.onNew?.();
      else if(selected==="resume") props.onResume?.();
      else props.onOpen(selected);
    }
  });
  const visible=Math.max(1,(props.rows ?? 10)-2);
  const start=Math.max(0,at-visible+1);
  return <Box flexDirection="column">
    <Text color={inkColor(theme.dim)}>Commands</Text>
    {commands.slice(start,start+visible).map((command, offset) => <Text key={command.overlay} color={inkColor(start + offset === at ? theme.brand : theme.dim)}>
      {start + offset === at ? "> " : "  "}{command.label}
    </Text>)}
    <Text color={inkColor(theme.faint)}>↑↓ to move · enter to open · esc to close</Text>
  </Box>;
}
