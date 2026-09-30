/**
 * The project list, as an overlay rather than a panel.
 *
 * It replaces the conversation while it is open and leaves nothing behind when it
 * closes, which is what an overlay is. A panel would sit there afterwards holding
 * space that the conversation needs.
 *
 * The list is the answer to "je sais pas": it makes choosing cheaper rather than
 * asking again with the same expected answer.
 */
import React, { useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { snapshotPortfolio } from "../../../../src/adapters/frontier.ts";
import { theme, glyph, inkColor } from "../theme/tokens.ts";

export function Projects({ onChoose }: { onChoose(path: string): void }): JSX.Element {
  // Read once when the overlay opens. The observer may be interrupted, which is
  // the one thing a project list must not do halfway through being read.
  const free = useMemo(() => snapshotPortfolio().free.slice(0, 10), []);
  const [at, setAt] = React.useState(0);

  useInput((_input, key) => {
    if (key.downArrow) return setAt((i) => Math.min(i + 1, free.length - 1));
    if (key.upArrow) return setAt((i) => Math.max(i - 1, 0));
    if (key.return) return onChoose(free[at]!);
  });

  return (
    <Box flexDirection="column">
      <Text color={inkColor(theme.dim)}>libres a l'ecriture</Text>
      {free.map((p, i) => (
        <Box key={p}>
          <Text color={inkColor(i === at ? theme.brand : theme.faint)}>
            {i === at ? `${glyph.input} ` : "  "}
          </Text>
          <Text color={inkColor(i === at ? theme.text : theme.dim)} bold={i === at}>
            {p.split("/").pop()}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
