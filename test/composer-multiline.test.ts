import { it } from "node:test";
import assert from "node:assert/strict";
import { edit, characters, cleanTerminalInput } from "../apps/terminal/src/components/editor.ts";
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

it("real PTY bracketed paste cannot put terminal framing into the prompt", () => {
  const input="\x1b[200~const a = 1;\r\nconsole.log(a);\n// é 👩‍💻\x1b[201~";
  const clean=cleanTerminalInput(input);
  assert.equal(clean,"const a = 1;\r\nconsole.log(a);\n// é 👩‍💻");
  assert.equal(edit("",0,{insert:clean}).text,"const a = 1;\nconsole.log(a);\n// é 👩‍💻");
  // Ink on macOS sometimes consumes the leading ESC before forwarding input.
  assert.equal(cleanTerminalInput("[200~bonjour\nmonde\x1b[201~"),"bonjour\nmonde");
  assert.equal(cleanTerminalInput("texte\x1b[31m coloré\x1b[0m"),"texte coloré");
  assert.equal(cleanTerminalInput("x\x1b]0;fenêtre pirate\x07y"),"xy");
  assert.equal(cleanTerminalInput("col\tname\nnext"),"col\tname\nnext");
});
