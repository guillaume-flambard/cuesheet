import { it } from "node:test";
import assert from "node:assert/strict";
import { edit, characters } from "../apps/terminal/src/components/editor.ts";
import { composerLines, composerRowCount } from "../apps/terminal/src/components/composer-layout.ts";

it("preserves pasted code and newlines instead of flattening it", () => {
  const text="const a = 1;\nconsole.log(a);\n// é 👩‍💻";
  const first=edit("",0,{insert:text});
  assert.equal(first.text,text);
  assert.equal(first.cursor,characters(text).length);
  assert.equal(edit(first.text,first.cursor,"backspace").text,"const a = 1;\nconsole.log(a);\n// é ");
  assert.equal(edit("a\nb",2,"backspace").text,"ab");
});

it("bounds multi-line composer rows and locates the cursor line", () => {
  const text="alpha\nbeta\ngamma\ndelta";
  assert.equal(composerRowCount(text,40),3);
  assert.equal(composerRowCount("alpha",40),1);
  assert.equal(composerRowCount(text,12),2);
  const all=composerLines(text,characters(text).length,40,3);
  assert.deepEqual(all.map(l=>l.text),["beta","gamma","delta"]);
  assert.equal(all.at(-1)?.focused,true);
  const atTop=composerLines(text,2,40,3);
  assert.deepEqual(atTop.map(l=>l.text),["alpha","beta","gamma"]);
  assert.equal(atTop[0]?.focused,true);
});

it("a huge pasted line never expands the shell beyond its width", () => {
  const lines=composerLines("a".repeat(1000)+"\nb",980,40,3);
  assert.ok(lines.length<=3);
  assert.ok(lines.every(l=>[...l.visible].length<=38));
  assert.ok(lines.some(l=>l.focused&&l.visible.includes("a")));
});
