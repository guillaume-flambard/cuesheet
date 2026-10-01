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
import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import { characters, edit, type Edit } from "./editor.ts";

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
  active?: boolean;
  history?: readonly string[];
}): JSX.Element {
  const [cursor, setCursor] = useState(characters(props.value).length);
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => { if (!props.value) { setCursor(0); setHistoryAt(null); } }, [props.value]);
  const apply = (action: Edit | { insert: string }) => {
    const next = edit(props.value, cursor, action);
    setCursor(next.cursor); props.onChange(next.text);
    if (next.text !== props.value) { setHistoryAt(null); setDraft(next.text); }
  };
  useInput((input, key) => {
    if (key.ctrl && input === "c") return props.onQuit();
    if (key.ctrl && input === "k") return props.onPalette();
    if ((key.ctrl && (input === "i" || input === "l")) || key.tab) return props.onInspect();
    if (props.active === false) return;
    if (key.return) return props.onSubmit(props.value);
    if (key.upArrow || key.downArrow) {
      const history = props.history ?? [];
      if (!history.length) return;
      if (historyAt === null && key.downArrow) return;
      if (historyAt === null) setDraft(props.value);
      const next = key.upArrow ? Math.max(0, (historyAt ?? history.length) - 1) : (historyAt ?? history.length) + 1;
      const value = next >= history.length ? draft : history[next]!;
      setHistoryAt(next >= history.length ? null : next); setCursor(characters(value).length); props.onChange(value); return;
    }
    if (key.leftArrow) return apply("left");
    if (key.rightArrow) return apply("right");
    if (key.ctrl && input === "a") return apply("home");
    if (key.ctrl && input === "e") return apply("end");
    if (key.ctrl && input === "u") return apply("clear");
    if (key.backspace) return apply("backspace");
    if (key.delete) return apply("delete");
    if (key.escape) return apply("clear");
    if (!key.ctrl && !key.meta && input) return apply({ insert: input });
  });
  const chars = characters(props.value);
  const at = Math.min(cursor, chars.length);

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color={inkColor(theme.rule)}>{"─".repeat(props.width)}</Text>
      <Box>
        <Text color={inkColor(props.disabled ? theme.faint : theme.brand)} bold>{glyph.input} </Text>
        {props.value === "" ? (
          <>
            <Text inverse>{" "}</Text>
            <Text wrap="truncate-end" color={inkColor(theme.faint)}>
              {props.disabled ? "no model to answer with" : (props.placeholder ?? "dis-moi ce que tu veux faire")}          Ctrl+K
            </Text>
          </>
        ) : (
          <>
            <Text wrap="truncate-start">{chars.slice(0, at).join("")}</Text>
            <Text inverse>{chars[at] ?? " "}</Text>
            <Text wrap="truncate-end">{chars.slice(at + 1).join("")}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
