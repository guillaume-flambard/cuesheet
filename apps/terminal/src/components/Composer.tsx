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
import { composerLines } from "./composer-layout.ts";

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
  maxRows?: number;
  fileSuggestions?: () => Promise<string[]>;
}): JSX.Element {
  const [cursor, setCursor] = useState(characters(props.value).length);
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [files,setFiles]=useState<string[]>([]);
  const [mentionAt,setMentionAt]=useState(0);
  useEffect(()=>{
    let live=true;
    props.fileSuggestions?.().then(names=>{if(live)setFiles(names);}).catch(()=>{if(live)setFiles([]);});
    return ()=>{live=false;};
  },[props.fileSuggestions]);
  const prefix=characters(props.value).slice(0,cursor).join("");
  const mention=/(?:^|\s)@([\w./-]*)$/.exec(prefix);
  const matches=mention
    ? files.filter(path=>path.toLowerCase().includes(mention[1]!.toLowerCase())).slice(0,3)
    : [];

  useEffect(() => { if (!props.value) { setCursor(0); setHistoryAt(null); } }, [props.value]);
  const apply = (action: Edit | { insert: string }) => {
    const next = edit(props.value, cursor, action);
    setCursor(next.cursor); props.onChange(next.text);
    if (next.text !== props.value) { setHistoryAt(null); setDraft(next.text); setMentionAt(0); }
  };
  useInput((input, key) => {
    if (key.ctrl && input === "c") return props.onQuit();
    if (key.ctrl && input === "k") return props.onPalette();
    if (props.active !== false && key.tab && mention && matches.length>0) {
      const replacement=matches[mentionAt % matches.length]!;
      const before=characters(props.value).slice(0,cursor).join("");
      const after=characters(props.value).slice(cursor).join("");
      const current=mention[0]!;
      const replaced=before.slice(0,-current.length)+(current.startsWith(" ")?" ":"")+"@"+replacement+" "+after;
      props.onChange(replaced);
      setCursor(characters(before.slice(0,-current.length)+(current.startsWith(" ")?" ":"")+"@"+replacement+" ").length);
      setHistoryAt(null);
      return;
    }
    if ((key.ctrl && (input === "i" || input === "l")) || key.tab) return props.onInspect();
    if (props.active === false) return;
    // Ctrl+J is a portable newline; Option/Alt+Enter works where a terminal
    // reports the modifier. Bare Enter alone sends the whole original draft.
    if ((key.ctrl && input === "j") || (key.return && key.meta)) return apply({ insert: "\n" });
    if (key.return) return props.onSubmit(props.value);
    if (key.upArrow || key.downArrow) {
      if (mention && matches.length > 0) {
        setMentionAt(i => (i + (key.downArrow ? 1 : matches.length - 1)) % matches.length);
        return;
      }
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
    // Ink dispatches batched paste as a single input event. Retain line breaks;
    // unlike a bare Return event, a chunk of source text cannot submit work.
    if (!key.ctrl && !key.meta && input) return apply({ insert: input });
  });
  const lines = composerLines(props.value, cursor, props.width, props.maxRows ?? 1);

  return (
    <Box flexDirection="column" flexShrink={0} width={props.width}>
      <Text color={inkColor(theme.rule)}>{"─".repeat(props.width)}</Text>
      {props.value === "" ? (
        <Box>
          <Text color={inkColor(props.disabled ? theme.faint : theme.brand)} bold>{glyph.input} </Text>
          <Text inverse>{" "}</Text>
          <Text wrap="truncate-end" color={inkColor(theme.faint)}>
            {props.disabled ? "aucun modèle pour répondre" : `${props.placeholder ?? "dis-moi ce que tu veux faire"}     Ctrl+K`}
          </Text>
        </Box>
      ) : lines.map((line, i) => (
        <Box key={i} width={props.width} overflow="hidden">
          <Text color={inkColor(line.focused ? theme.brand : theme.faint)}>{line.focused ? glyph.input : " "} </Text>
          <Box width={Math.max(1, props.width - 2)} overflow="hidden">
            <Text wrap="truncate-end">
              {line.before}
              {line.focused ? <Text inverse>{line.caret}</Text> : null}
              {line.after}
            </Text>
          </Box>
        </Box>
      ))}
      {mention && matches.length>0 && <Text wrap="truncate-end" color={inkColor(theme.dim)}>
        {"@ "+matches[mentionAt % matches.length]+" · "+(mentionAt % matches.length+1)+"/"+matches.length+" · ↑↓ choisir · Tab insérer"}
      </Text>}
    </Box>
  );
}
