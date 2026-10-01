/** Cursor positions count graphemes, so deletion does not split an emoji. */
export const characters = (text: string): string[] =>
  [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);

export type Edit = "left" | "right" | "home" | "end" | "backspace" | "delete" | "clear";
export function edit(text: string, cursor: number, action: Edit | { insert: string }): { text: string; cursor: number } {
  const chars = characters(text);
  let at = Math.max(0, Math.min(cursor, chars.length));
  if (typeof action === "object") {
    const inserted = characters(action.insert.replace(/[\r\n]+/g, " "));
    chars.splice(at, 0, ...inserted); at += inserted.length;
  } else if (action === "left") at = Math.max(0, at - 1);
  else if (action === "right") at = Math.min(chars.length, at + 1);
  else if (action === "home") at = 0;
  else if (action === "end") at = chars.length;
  else if (action === "backspace" && at > 0) chars.splice(--at, 1);
  else if (action === "delete") chars.splice(at, 1);
  else if (action === "clear") { chars.length = 0; at = 0; }
  return { text: chars.join(""), cursor: at };
}
