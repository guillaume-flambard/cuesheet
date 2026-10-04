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
import {SelectionRow,ViewTitle} from "../components/Surface.tsx";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import type { Option } from "../app/state.ts";

export function Projects(props: {
  rows?:number;
  width?:number;
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

  const visible=Math.max(1,Math.floor(((props.rows??14)-4)/2)),start=Math.max(0,at-visible+1);
  return (
    <Box flexDirection="column">
      <ViewTitle title="Resolve the project" detail={`${at+1} / ${choices.length}`}/>
      {choices.slice(start,start+visible).map((c, offset) => {const i=start+offset;return (
        <Box key={c.path} flexDirection="column">
          <SelectionRow width={props.width??64} selected={i===at} label={c.name} detail={c.path}/>

          <Text color={inkColor(theme.faint)}>      {c.why}</Text>
        </Box>
      );})}
      <Box marginTop={1}>
        <Text color={inkColor(theme.faint)}>↑↓ choose · Enter confirm · Esc close</Text>
      </Box>
    </Box>
  );
}