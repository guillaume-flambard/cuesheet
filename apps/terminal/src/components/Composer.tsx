/**
 * The composer: the centre of the application.
 *
 * It is always visible, always at the bottom, and always the same width as
 * everything above it. A log that grows downward pushes the place you type out of
 * reach, which is the reason a chat window is the bottom half and the toolbars
 * are on the sides in every application that got this right.
 *
 * The hint text is a suggestion, not a requirement. It disappears on the first
 * keystroke and is never shown again for that session.
 */
import React from "react";
import { Box, Text, useInput } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";

export function Composer(props: {
  width: number;
  value: string;
  onChange(text: string): void;
  onSubmit(text: string): void;
  onQuit(): void;
  onPalette(): void;
  onHelp(): void;
  /** Vanishes after the first keystroke and never returns in the session. */
  placeholder?: string;
}): JSX.Element {
  useInput((input, key) => {
    if (key.ctrl && input === "c") return props.onQuit();
    if (key.ctrl && input === "k") return props.onPalette();
    if (key.return) return props.onSubmit(props.value);
    if (key.backspace || key.delete) return props.onChange(props.value.slice(0, -1));
    if (key.escape) return props.onChange("");
    if (!key.ctrl && !key.meta && input) return props.onChange(props.value + input);
  });

  return (
    <Box flexDirection="column">
      <Text color={inkColor(theme.rule)}>{"─".repeat(props.width)}</Text>
      <Box>
        <Text color={inkColor(theme.brand)} bold>{glyph.input} </Text>
        {props.value === "" ? (
          <Text color={inkColor(theme.faint)}>
            {props.placeholder ?? "on travaille sur quoi ?"}          ⌘K
          </Text>
        ) : (
          <>
            <Text>{props.value}</Text>
            <Text inverse>{" "}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
