/**
 * The one-row editor window, asserted by reconstruction rather than by picture.
 *
 * A rendering that loses or duplicates a grapheme is the classic terminal editor
 * bug, and it is invisible on screen: the row is full, so nothing looks wrong.
 * Every case here therefore rebuilds the draft from the segments the view
 * returns and compares it to the original, which fails the moment a character is
 * dropped, duplicated or shifted by the truncation markers.
 *
 * The cursor block is rendered on the side it is travelling towards, so the
 * leftward cases are the ones that double an edge character when they regress.
 */
import { it } from "node:test";
import assert from "node:assert/strict";
import { editorView } from "../apps/terminal/src/components/editor.ts";

const rebuild = (view: ReturnType<typeof editorView>): string =>
  (view.before + view.first + view.second + view.after)
    .replaceAll("\u2039", "")
    .replaceAll("\u203a", "")
    .replace(/\s+$/, "");

it("every selection direction reconstructs the draft exactly", () => {
  const cases: Array<[string, number, { start: number; end: number } | undefined]> = [
    ["alpha beta gamma", 13, { start: 6, end: 13 }],  // rightward, cursor past the range
    ["alpha beta gamma", 6, { start: 6, end: 13 }],   // leftward, cursor on the first grapheme
    ["alpha beta gamma", 13, undefined],              // no selection at all
    ["alpha beta gamma", 0, { start: 0, end: 6 }],    // selection from the line start
    ["alpha beta gamma", 16, { start: 6, end: 16 }],  // selection to the line end
    ["short", 8, undefined],                          // cursor past the end of a short draft
    ["short", 3, { start: 3, end: 3 }],               // an empty range selects nothing
    ["short", 0, { start: 0, end: 5 }],               // the whole draft
    ["emoji \u{1F469}\u200D\u{1F4BB} tail", 22, { start: 5, end: 22 }],
    ["two\nlines", 4, { start: 0, end: 4 }],          // a newline inside the selection
    ["two\nlines", 12, { start: 4, end: 12 }],
  ];
  for (const [text, cursor, range] of cases) {
    assert.equal(
      rebuild(editorView(text, cursor, 40, range)),
      text.replaceAll("\n", "\u21B5").replace(/\s+$/, ""),
      `segments must rebuild ${JSON.stringify(text)} at cursor ${cursor}`,
    );
  }
});

it("a long draft scrolls instead of hiding the selection or the cursor", () => {
  const long = "x".repeat(60) + "ENDMARK";
  const view = editorView(long, 60, 20, { start: 50, end: 60 });
  // The window must contain the selection and the block, and say text is hidden.
  assert.ok(view.first.length >= 10, "the selected graphemes stay visible");
  assert.ok(view.before.includes("\u2039"), "hidden text to the left is marked");
  const view2 = editorView(long, 0, 20);
  assert.ok(view2.after.includes("\u203a"), "hidden text to the right is marked");
  assert.ok(view2.before === "", "nothing is hidden at the line start");
});
