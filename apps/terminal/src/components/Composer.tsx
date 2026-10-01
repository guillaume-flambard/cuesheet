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
 *
 * ## What changed in V2
 *
 * The placeholder no longer asks what to work on. It says the one thing that is
 * true and useful, which is that any sentence is accepted:
 *
 * ```text
 * before  on travaille sur quoi ?
 * after   dis-moi ce que tu veux faire
 * ```
 *
 * The old one was a question about project selection, and it invited exactly the
 * reply the V1 router then failed to understand. `disabled` is new as well: when
 * there is no provider, the composer still accepts and records a sentence, so a
 * person never loses what they typed, but it says why nothing is happening.
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
  onInspect(): void;
  /** Vanishes after the first keystroke and never returns in the session. */
  placeholder?: string;
  /** True when there is no provider. The sentence is still recorded. */
  disabled?: boolean;
}): JSX.Element {
  useInput((input, key) => {
    if (key.ctrl && input === "c") return props.onQuit();
    if (key.ctrl && input === "k") return props.onPalette();
    if (key.ctrl && input === "i") return props.onInspect();
    if (key.return) return props.onSubmit(props.value);
    if (key.backspace || key.delete) return props.onChange(props.value.slice(0, -1));
    if (key.escape) return props.onChange("");
    if (!key.ctrl && !key.meta && input) return props.onChange(props.value + input);
  });

  return (
    <Box flexDirection="column">
      <Text color={inkColor(theme.rule)}>{"─".repeat(props.width)}</Text>
      <Box>
        <Text color={inkColor(props.disabled ? theme.faint : theme.brand)} bold>{glyph.input} </Text>
        {props.value === "" ? (
          <Text color={inkColor(theme.faint)}>
            {props.disabled ? "no model to answer with" : (props.placeholder ?? "dis-moi ce que tu veux faire")}          ⌘K
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