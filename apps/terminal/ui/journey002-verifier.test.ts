/**
 * The independent verifier for Journey 002. The model never sees this file.
 *
 * It does not look at the diff, does not trust a claim, and does not know how the
 * change was made. It renders the real StatusBar and reads what a person would
 * read, which is the only thing the task actually promises.
 *
 * Copied into the candidate under apps/terminal/ui/ after the model
 * has finished, so the model cannot read it and cannot shape its edit around a
 * test name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { StatusBar } from "../src/components/StatusBar.tsx";
import type { Entry } from "../src/app/state.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Render the bar once and return the text the terminal would have received. */
async function bar(props: { entries: readonly Entry[]; busy?: boolean; notifications?: number }): Promise<string> {
  const out = new PassThrough();
  let frame = "";
  out.on("data", (chunk) => { frame += String(chunk); });
  const instance = render(
    createElement(StatusBar, { width: 100, entries: props.entries, busy: props.busy ?? false, notifications: props.notifications, onHelp() {} }),
    { stdout: out as never, stderr: out as never, stdin: process.stdin, debug: true, exitOnCtrlC: false },
  );
  await sleep(120);
  instance.unmount();
  await sleep(60);
  // Ink paints with cursor moves; the visible text is what remains after them.
  return frame.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b[()][B0]/g, "");
}

const action = (label: string, certainty: Entry extends { certainty: infer C } ? C : never = "confirmed" as never): Entry =>
  ({ id: `e:${label}`, kind: "action", label, certainty, detail: "x" }) as Entry;

test("J2-01 a count of one reads in the singular", async () => {
  const one = await bar({ entries: [action("read")] });
  assert.match(one, /\b1\b/, `the read count is missing entirely: ${JSON.stringify(one)}`);
  assert.doesNotMatch(one, /\(s\)/, `a count of one still reads as a plural placeholder: ${JSON.stringify(one)}`);
  assert.doesNotMatch(one, /\b1\s+reads\b/, `plural verb used for a single count: ${JSON.stringify(one)}`);
});

test("J2-02 a count above one still reads as a plural", async () => {
  const many = await bar({ entries: [action("read"), action("read 2"), action("read 3")] });
  assert.match(many, /\b3\b/, `the count is missing: ${JSON.stringify(many)}`);
  assert.doesNotMatch(many, /\(s\)/, `the plural placeholder survives: ${JSON.stringify(many)}`);
});

test("J2-03 a zero count stays absent, and the bar keeps its other job", async () => {
  const quiet = await bar({ entries: [] });
  assert.doesNotMatch(quiet, /\b0\b/, `a zero count must not be shown: ${JSON.stringify(quiet)}`);
  assert.match(quiet, /help/, `the idle bar lost its affordance: ${JSON.stringify(quiet)}`);
});

test("J2-04 notifications take the same singular and plural", async () => {
  const one = await bar({ entries: [], notifications: 1 });
  assert.match(one, /\b1\b/, `the notification count is missing: ${JSON.stringify(one)}`);
  assert.doesNotMatch(one, /\(s\)/, `a single notification still renders a placeholder: ${JSON.stringify(one)}`);
  const two = await bar({ entries: [], notifications: 2 });
  assert.match(two, /\b2\b/);
  assert.doesNotMatch(two, /\(s\)/);
});
