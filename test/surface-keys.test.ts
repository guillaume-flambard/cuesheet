import { it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv } from "./fixtures/hermetic-env.ts";

it("PTY: palette and log shortcuts render, and overlay Enter does not submit", { skip: !existsSync("/usr/bin/expect") }, () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-keys-"));
  try {
    const bin = join(root, "bin"); mkdirSync(bin);
    const env = childEnv({ home: root, sessions: join(root, "sessions") });
    env.PATH = `${bin}:${env.PATH}`;
    env.TERM = "xterm-256color";
    const proposal = { text: "visible model answer", toolCalls: [] };
    const stream = [{ type: "text", part: { type: "text", text: JSON.stringify(proposal) } }, { type: "step_finish", part: { type: "step-finish", cost: 0 } }].map((e) => JSON.stringify(e)).join("\n");
    writeFileSync(join(bin, "opencode"), `#!/bin/sh\ncat <<'STREAM'\n${stream}\nSTREAM\n`, { mode: 0o755 });
    const driver = join(root, "keys.exp");
    const entry = new URL("../src/cuesheet.ts", import.meta.url).pathname;
    writeFileSync(driver, `set stty_init {rows 45 columns 140}
set timeout 1
proc seen {pattern} {
  expect -timeout 10 -re $pattern {} timeout {catch {close}; exit 8} eof {exit 9}
}
proc waitms {ms} {
  set end [expr {[clock milliseconds] + $ms}]
  while {[clock milliseconds] < $end} {
    expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}
  }
}
match_max -d 100000
spawn {${process.execPath}} {${entry}}
seen {Ctrl\\+K}
waitms 1500
send "\\013"
seen {Commands}
waitms 300
send "\\r"
seen {nothing has happened yet}
waitms 300
send "\\033"
waitms 500
send "\\014"
seen {nothing has happened yet}
waitms 300
send "\\033"
waitms 500
send_user "MARK_SUBMIT\\n"
send "answer the question"
waitms 1000
send "\\r"
seen {visible model answer}
waitms 300
send "\\014"
seen {the log, as appended}
waitms 300
send "\\003"
after 300
catch {close}
exit 0
`);
    const run = spawnSync("/usr/bin/expect", [driver], { cwd: root, env, encoding: "utf8", timeout: 40_000 });
    writeFileSync(join(root, "pty.raw"), run.stdout);
    assert.equal(run.status, 0, `${run.error ?? ""}\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Commands/);
    assert.match(run.stdout, /nothing has happened yet/);
    assert.match(run.stdout, /visible model answer/);
    assert.match(run.stdout, /the log, as appended/);
    assert.doesNotMatch(run.stdout.split("MARK_SUBMIT")[0]!, /working in/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("PTY: declared owner check closes real surface work with independent evidence", { skip: !existsSync("/usr/bin/expect") }, () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-complete-pty-"));
  try {
    const work = join(root, "work"); mkdirSync(work);
    const bin = join(root, "bin"); mkdirSync(bin);
    const oracle = join(work, "check.mjs");
    writeFileSync(oracle, `import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; assert.equal(readFileSync('answer.txt','utf8'),'42');`);
    const env = childEnv({ home: root, sessions: join(root, "sessions") });
    env.PATH = `${bin}:${env.PATH}`; env.TERM = "xterm-256color";
    const proposal = { text: "My output needs checking", toolCalls: [
      { name: "node", input: { argv: ["node", "-e", "require('fs').writeFileSync('answer.txt','42')"] } },
      { name: "finish", input: {} },
    ] };
    const stream = [{ type: "text", part: { type: "text", text: JSON.stringify(proposal) } }, { type: "step_finish", part: { type: "step-finish", cost: 0 } }].map(e => JSON.stringify(e)).join("\n");
    writeFileSync(join(bin,"opencode"), `#!/bin/sh\ncat <<'STREAM'\n${stream}\nSTREAM\n`, { mode: 0o755 });
    const entry = new URL("../src/cuesheet.ts", import.meta.url).pathname;
    const driver = join(root,"complete.exp");
    writeFileSync(driver, `set stty_init {rows 45 columns 140}
set timeout 1
proc seen {pattern} {
  expect -timeout 10 -re $pattern {} timeout {catch {close}; exit 8} eof {exit 9}
}
proc waitms {ms} {
  set end [expr {[clock milliseconds] + $ms}]
  while {[clock milliseconds] < $end} {
    expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}
  }
}
match_max -d 100000
spawn {${process.execPath}} {${entry}} surface --verify {${oracle}}
seen {Ctrl\\+K}
waitms 1500
send "write answer.txt containing 42"
waitms 1000
send "\\r"
seen {settled in 1 step}
waitms 300
send "\\003"
after 200
catch {close}
exit 0
`);
    const run = spawnSync("/usr/bin/expect", [driver], { cwd: work, env, encoding: "utf8", timeout: 20_000 });
    writeFileSync(join(root, "pty.raw"), run.stdout);
    assert.equal(run.status,0, `${run.error ?? ""}\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /verified by the declared check/);
    assert.match(run.stdout, /settled in 1 step/);
    assert.equal(readFileSync(join(work,'answer.txt'),'utf8'),'42');
  } finally { rmSync(root, {recursive:true,force:true}); }
});
