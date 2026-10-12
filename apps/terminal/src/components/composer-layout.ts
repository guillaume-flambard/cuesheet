import { characters } from "./editor.ts";

export function composerRowCount(text: string, terminalRows: number): number {
  return Math.min(terminalRows < 20 ? 2 : 3, Math.max(1, text.split("\n").length));
}

export interface ComposerVisualLine {
  text: string;
  visible: string;
  before: string;
  caret: string;
  after: string;
  focused: boolean;
}

/** Display a bounded window around the grapheme cursor; original text stays intact. */
export function composerLines(text: string, cursor: number, width: number, maxRows: number): ComposerVisualLine[] {
  const raw = text.split("\n");
  const graphemes = raw.map(characters);
  let remaining = Math.max(0, Math.min(cursor, characters(text).length));
  let focus = 0;
  for (let i = 0; i < graphemes.length; i++) {
    const size = graphemes[i]!.length;
    if (remaining <= size || i === graphemes.length - 1) { focus = i; break; }
    remaining -= size + 1;
  }
  const start = Math.max(0, Math.min(focus, raw.length - Math.max(1, maxRows)));
  const limit = Math.max(1, width - 2);
  return raw.slice(start, start + Math.max(1, maxRows)).map((line, i) => {
    const index = i + start;
    const focused = index === focus;
    const chars = graphemes[index]!;
    const at = focused ? Math.min(remaining, chars.length) : chars.length;
    const from = focused ? Math.min(Math.max(0, at - Math.floor(limit / 2)), Math.max(0, chars.length - limit)) : 0;
    const slice = chars.slice(from, from + limit);
    const before = slice.slice(0, Math.max(0, at - from)).join("");
    const caret = focused ? (slice[at - from] ?? " ") : "";
    const after = slice.slice(Math.max(0, at - from) + (focused ? 1 : 0)).join("");
    return { text: line, visible: slice.join(""), before, caret, after, focused };
  });
}
