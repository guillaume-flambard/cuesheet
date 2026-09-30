/**
 * The vertical slice: one path, done properly.
 *
 * $HOME -> cuesheet -> greeting -> a sentence in plain French -> the portfolio
 * resolves it -> the project is chosen -> a prompt ready to work.
 *
 * Nothing else. No history, no artifacts, no verification panel, no command
 * palette. Those are states nobody has used yet, and building them now is how
 * a surface ends up polished around twenty states and still wrong.
 *
 * The previous version of this file was 322 lines of Ink, it did not compile,
 * and it had already begun replacing the visual identity with ASCII so that
 * TypeScript would accept it, one symbol at a time, until the surface looked
 * like a different product. That is the design mutilating itself to satisfy the
 * compiler, which is the exact inversion of the point. So this file is rebuilt
 * small, keeps the glyphs, and lets the render be a pure function of state so
 * it can be read in a test without a terminal.
 */

import { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { useInput } from "ink";
import { render, resolve, type Slice } from "./render.ts";

/**
 * Two colours, and no others.
 *
 * The accent marks the prompt and the product name, and nothing else. A surface
 * that colours everything is a surface that has nothing to point at.
 */
const ACCENT = "cyan";

export function Slice_() {
  const { exit } = useApp();
  const [slice, setSlice] = useState<Slice>({ at: "welcome" });
  const [typed, setTyped] = useState("");

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();
    if (key.return) {
      const said = typed.trim();
      if (!said) return;
      setSlice({ at: "resolving" });
      // Naming a project reads the registry and costs about a millisecond, so
      // this resolves immediately. There used to be a 120ms pause here, added
      // when resolution probed git for every repository and genuinely took two
      // seconds. Now that it is instant, the pause would be theatre, and
      // `Looking through your projects…` appears for one frame.
      setSlice(resolve(said));
      return;
    }
    if (key.backspace || key.delete) return setTyped((t) => t.slice(0, -1));
    if (key.escape) return setTyped("");
    if (!key.ctrl && !key.meta && input) setTyped((t) => t + input);
  });

  const lines = render(slice, typed);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {lines.map((line, i) => (
        <Text key={i} color={line === "cuesheet" ? ACCENT : undefined}>
          {line}
        </Text>
      ))}
      {slice.at === "welcome" || slice.at === "ambiguous" || slice.at === "unresolved"
        || slice.at === "question" || slice.at === "greeting" ? (
        // One row, prompt and text in it, so the caret lands where the words are
        // instead of a line below them. `slice.at === "resolving"` is excluded
        // on purpose: while the portfolio is being read there is nothing to type
        // into, and showing an empty prompt invites a keystroke that goes
        // nowhere.
        <Text>
          <Text color={ACCENT} bold>
            {"› "}
          </Text>
          <Text>{typed}</Text>
          <Text inverse>{" "}</Text>
        </Text>
      ) : null}
    </Box>
  );
}
