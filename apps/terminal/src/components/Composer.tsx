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
 * after   what would you like to do?
 * ```
 *
 * The old one was a question about project selection, and it invited exactly the
 * reply the V1 router then failed to understand. `disabled` is new as well: when
 * there is no provider, the composer still accepts and records a sentence, so a
 * person never loses what they typed, but it says why nothing is happening.
 */
import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import {completeCommand,commandMatches} from "../app/commands.ts";
import { characters, edit, editorView, type Edit } from "./editor.ts";

export function Composer(props: {
  width: number;
  value: string;
  onChange(text: string): void;
  onSubmit(text: string): void;
  onQuit(): void;
  onPalette(): void;
  onModels?(): void;
  onHelp(): void;
  onInspect(): void;
  /** Vanishes after the first keystroke and never returns in the session. */
  placeholder?: string;
  /** True when there is no provider. The sentence is still recorded. */
  disabled?: boolean;
  active?: boolean;
  preserveOnEscape?: boolean;
  history?: readonly string[];
}): JSX.Element {
  const [cursor, setCursor] = useState(characters(props.value).length);
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const {stdin}=useStdin();
  const editor=useRef({text:props.value,cursor,rendered:props.value});
  if(editor.current.rendered!==props.value){editor.current.text=props.value;editor.current.rendered=props.value;editor.current.cursor=Math.min(editor.current.cursor,characters(props.value).length);}
  useEffect(() => { if (!props.value) { setCursor(0); setHistoryAt(null); } }, [props.value]);
  const apply = (action: Edit | { insert: string }) => {
    const next = edit(editor.current.text, editor.current.cursor, action);
    editor.current.text=next.text;editor.current.cursor=next.cursor;
    setCursor(next.cursor); props.onChange(next.text);
    if (next.text !== props.value) { setHistoryAt(null); setDraft(next.text); }
  };
  useInput((input, key) => {
    const paste=(stdin as {pasteText?:string|null}).pasteText;
    if(paste!=null){if(props.active!==false)apply({insert:paste});return;}
    if (key.ctrl && input === "c") return props.onQuit();
    if (key.ctrl && input === "p") return props.onModels?.();
    if (key.ctrl && input === "k") return props.onPalette();
    if(key.tab&&props.active!==false&&editor.current.text.startsWith('/')){const next=completeCommand(editor.current.text);if(next){editor.current.text=next;editor.current.cursor=characters(next).length;setCursor(editor.current.cursor);props.onChange(next);}return;}
    if (props.active!==false && ((key.ctrl && (input === "i" || input === "l")) || key.tab)) return props.onInspect();
    if (props.active === false) return;
    if(key.meta&&(input==='b'||key.leftArrow))return apply("word-left");
    if(key.meta&&(input==='f'||key.rightArrow))return apply("word-right");
    if((key.meta&&(key.backspace||key.delete))||(key.ctrl&&input==='w'))return apply("word-backspace");
    if (key.ctrl && input === "o") return apply({insert:"\n"});
    // Ink 4 leaves ESC+CR as literal CR after removing ESC, without a meta flag.
    if ((input === "\r" && !key.return) || (key.return && (key.shift || key.meta))) return apply({insert:"\n"});
    if (key.return || input === "\n") {
      return props.onSubmit(editor.current.text);
    }
    if (key.upArrow || key.downArrow) {
      const history = props.history ?? [];
      if (!history.length) return;
      if (historyAt === null && key.downArrow) return;
      if (historyAt === null) setDraft(props.value);
      const next = key.upArrow ? Math.max(0, (historyAt ?? history.length) - 1) : (historyAt ?? history.length) + 1;
      const value = next >= history.length ? draft : history[next]!;
      editor.current.text=value;editor.current.cursor=characters(value).length;
      setHistoryAt(next >= history.length ? null : next); setCursor(characters(value).length); props.onChange(value); return;
    }
    if (key.leftArrow) return apply("left");
    if (key.rightArrow) return apply("right");
    if (key.ctrl && input === "a") return apply("home");
    if (key.ctrl && input === "e") return apply("end");
    if (key.ctrl && input === "u") return apply("clear");
    if (key.backspace) return apply("backspace");
    if (key.delete) return apply("delete");
    if (key.escape) {if(!props.preserveOnEscape)apply("clear");return;}
    if (!key.ctrl && !key.meta && input) return apply({ insert: input });
  });
  const view=editorView(props.value,cursor,Math.max(3,props.width-4));
  const focused=props.active!==false;
  const surface=focused?inkColor(theme.focus):undefined;
  const empty=props.value==='';
  const placeholder=props.disabled?'Choose a model with Ctrl+P':(props.placeholder??'What would you like to do?');
  const hint=focused&&props.value.startsWith('/')&&!props.value.slice(1).includes('/')&&!/\s/.test(props.value)?(commandMatches(props.value).slice(0,4).map(c=>'/'+c.name).join('  ')||'Unknown command · /help'):'';
  return <Box flexDirection="column" flexShrink={0} width={props.width}>
    <Text wrap="truncate-end" color={inkColor(theme.faint)}>{hint||' '}</Text>
    <Text backgroundColor={surface} color={inkColor(theme.text)} wrap="truncate-end">
      <Text color={inkColor(props.disabled||!focused?theme.faint:theme.brand)} bold> › </Text>
      {empty?<><Text inverse={focused}> </Text><Text color={inkColor(theme.faint)}>{placeholder.padEnd(Math.max(0,props.width-4))}</Text></>:<><Text>{view.before}</Text><Text inverse={focused}>{view.cursor}</Text><Text>{view.after}{' '.repeat(Math.max(0,props.width-3-view.cells))}</Text></>}
    </Text>
    <Text> </Text>
  </Box>;
}
