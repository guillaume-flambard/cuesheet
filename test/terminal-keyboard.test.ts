/**
 * The keyboard path, end to end and assertable without a terminal.
 *
 * The composer's failures were never in one component: they lived in the join
 * between what a terminal sends and what Ink 4 reports. `useInput`'s Key object
 * has no home or end flag and gives no modifier for Ctrl+Left, so Home, End,
 * Ctrl+arrow and Ctrl+Backspace were dead in a real PTY while every unit test of
 * the individual pieces passed. This file drives the production chain instead:
 *
 *   stdin bytes -> terminalInput -> Ink useInput -> Composer -> store
 *
 * which is the only place a claim about the keyboard can be true or false.
 */

import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

const terminal = resolve("apps/terminal");

/** The production wiring, minus the process: real transform, real Ink, real composer. */
function run(script: string): { status: number | null; stdout: string; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-keyboard-"));
  try {
    const file = join(root, "keyboard.tsx");
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    writeFileSync(file, script);
    const result = spawnSync(
      process.execPath,
      [join(terminal, "node_modules/tsx/dist/cli.mjs"), file],
      { encoding: "utf8", timeout: 30000, cwd: resolve(".") },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const composer = (state: { composer: string }) => state.composer;

it("Home and End move the cursor and are not dropped as unreadable keys", () => {
  const result = run(`import React from ${JSON.stringify(join(terminal, "node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal, "node_modules/ink/build/index.js"))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal, "src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal, "src/app/store.ts"))};
import {terminalInput} from ${JSON.stringify(join(terminal, "src/terminal-input.ts"))};
const store=createStore();
const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:false});
const raw=new PassThrough();Object.assign(raw,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const keyboard=terminalInput(raw as any);
const sent=[];const app=render(<App store={store} producer={{say(text){sent.push(text);}, choose(){}}}/>,{stdout:out as any, stderr:out as any, stdin:keyboard.input as any, debug:true, exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,60));
const write=s=>{raw.write(s);return tick();};
(async()=>{
  await write('banana');
  await write('\\x1b[H');   // Home      cursor to line start
  await write('A');        // insert    "Abnana"
  await write('\\x1b[F');   // End       cursor to line end
  await write('Z');        // insert    "AbnanaZ"
  await write('\\x1bOH');   // Home, SS3/iTerm application-cursor encoding
  await write('B');        // insert    "BAbnanaZ"
  await write('\\x1bOF');   // End, SS3
  await write('Y');        // insert    "BAbananaZY"
  app.unmount();console.log(JSON.stringify({composer:store.get().composer}));
})();`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(composer(JSON.parse(result.stdout.trim())), "BAbananaZY");
});

it("Ctrl+arrow and Ctrl+Backspace move and delete whole words", () => {
  const result = run(`import React from ${JSON.stringify(join(terminal, "node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal, "node_modules/ink/build/index.js"))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal, "src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal, "src/app/store.ts"))};
import {terminalInput} from ${JSON.stringify(join(terminal, "src/terminal-input.ts"))};
const store=createStore();
const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:false});
const raw=new PassThrough();Object.assign(raw,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const keyboard=terminalInput(raw as any);
const app=render(<App store={store} producer={{say(){},choose(){}} as any}/>, {stdout:out as any, stderr:out as any, stdin:keyboard.input as any, debug:true, exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,60));
const write=s=>{raw.write(s);return tick();};
(async()=>{
  await write('alpha beta gamma');
  await write('\\x1b[1;5D');  // Ctrl+Left      one word back
  await write('\\x1b[1;5D');  // Ctrl+Left      a second word back
  await write('X');           // insert at that boundary
  await write('\\x1b[1;5C');  // Ctrl+Right     one word forward
  await write('\\x08');       // Ctrl+Backspace deletes the whole word run
  app.unmount();console.log(JSON.stringify({composer:store.get().composer}));
})();`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(composer(JSON.parse(result.stdout.trim())), "alpha gamma");
});

it("the ? help request opens help and leaves nothing in the draft", () => {
  const result = run(`import React from ${JSON.stringify(join(terminal, "node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal, "node_modules/ink/build/index.js"))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal, "src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal, "src/app/store.ts"))};
import {terminalInput} from ${JSON.stringify(join(terminal, "src/terminal-input.ts"))};
const store=createStore();
const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:false});
const raw=new PassThrough();Object.assign(raw,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const keyboard=terminalInput(raw as any);
const app=render(<App store={store} producer={{say(){},choose(){}}}/>,{stdout:out as any, stderr:out as any, stdin:keyboard.input as any, debug:true, exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,80));
const write=s=>{raw.write(s);return tick();};
(async()=>{
  await write('?');
  const overlay=store.get().overlay; const after=store.get().composer;
  await write('\\x1b');                   // Escape closes help
  const draftAfterClose=store.get().composer;
  app.unmount();console.log(JSON.stringify({overlay,after,draftAfterClose}));
})();`);
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout.trim());
  assert.equal(state.overlay, "help");
  assert.equal(state.after, "");
  assert.equal(state.draftAfterClose, "");
});

it("a full stop after every motion the transform now claims", () => {
  const result = run(`import React from ${JSON.stringify(join(terminal, "node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal, "node_modules/ink/build/index.js"))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal, "src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal, "src/app/store.ts"))};
import {terminalInput} from ${JSON.stringify(join(terminal, "src/terminal-input.ts"))};
const store=createStore();
const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:false});
const raw=new PassThrough();Object.assign(raw,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const keyboard=terminalInput(raw as any);
const app=render(<App store={store} producer={{say(){},choose(){}}}/>,{stdout:out as any, stderr:out as any, stdin:keyboard.input as any, debug:true, exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,60));
const write=s=>{raw.write(s);return tick();};
(async()=>{
  await write('one two three');
  await write('\\x1b[1~');   // Home, putty/rxvt encoding
  await write('\\x1b[1;5C'); // Ctrl+Right to after "one"
  await write('\\x17');      // Ctrl+W removes "one " -> "two three"
  await write('\\x1b[8~');   // End, rxvt
  await write('!');
  app.unmount();console.log(JSON.stringify({composer:store.get().composer}));
})();`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(composer(JSON.parse(result.stdout.trim())), "two three!");
});
