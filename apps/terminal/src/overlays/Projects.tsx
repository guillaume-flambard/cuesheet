/**
 * The project list, as an overlay rather than a panel.
 *
 * It replaces the conversation while it is open and leaves nothing behind when it
 * closes, which is what an overlay is. A panel would sit there afterwards holding
 * space that the conversation needs.
 *
 * ## What changed in V2, and why it matters
 *
 * In V1 this component called `snapshotPortfolio()` itself, in a `useMemo`, on
 * mount. That was a component deciding what the machine could offer, which breaks
 * the law at `app/state.ts:6` ("No TUI component decides anything") from the
 * inside, and it meant the answer to an ambiguity could not be tested without
 * reading the real portfolio off the real disk.
 *
 * Now the producer resolves the options and hands them down. The component draws
 * what it is given and emits a choice, which is all it ever should have done.
 *
 * Each option carries its own reason, because a suggestion without a reason is a
 * guess dressed as help: "its name matched" and "in the registry, not on disk"
 * are checkable, and the difference between them is the difference between a
 * working directory and a broken one.
 */
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import type { Option } from "../app/state.ts";

export function Projects(props: {
  choices: readonly Option[];
  onChoose(option: Option): void;
  onDismiss(): void;
}): JSX.Element {
  const [at, setAt] = useState(0);
  const choices = props.choices;

  useInput((input, key) => {
    if (key.downArrow || (input === "j" && !key.ctrl)) return setAt((i) => Math.min(i + 1, choices.length - 1));
    if (key.upArrow || (input === "k" && !key.ctrl)) return setAt((i) => Math.max(i - 1, 0));
    if (key.escape) return props.onDismiss();
    if (key.return) {
      const picked = choices[at];
      if (picked) props.onChoose(picked);
    }
  });

  if (choices.length === 0) {
    return <Text color={inkColor(theme.dim)}>nothing to choose from</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color={inkColor(theme.dim)}>{choices.length} could be it</Text>
      {choices.map((c, i) => (
        <Box key={c.path} flexDirection="column">
          <Box>
            <Text color={inkColor(i === at ? theme.brand : theme.faint)}>{i === at ? `${glyph.input} ` : "  "}</Text>
            <Text color={inkColor(i === at ? theme.text : theme.dim)} bold={i === at}>
              {c.name}
            </Text>
            <Text color={inkColor(theme.faint)}>  {c.path}</Text>
          </Box>
          <Text color={inkColor(theme.faint)}>      {c.why}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={inkColor(theme.faint)}>↑↓ to move · enter to work there · esc to keep working where you are</Text>
      </Box>
    </Box>
  );
}