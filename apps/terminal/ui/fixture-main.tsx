/**
 * The entry `npm run ui:verify` launches under a PTY.
 *
 * It mounts the REAL `App` with a scripted producer. The shell, the layout, the
 * palette, the timeline, the input handling and the resize path are all the
 * production ones. Only the model is replaced, because a provider call cannot
 * be reproduced and Render Proof has to be.
 */
import { createElement } from "react";
import { render } from "ink";
import { App } from "../src/app/App.tsx";
import { createStore } from "../src/app/store.ts";
import { createFixtureProducer } from "./fixture-producer.ts";
import {terminalInput} from '../src/terminal-input.ts';

const store = createStore();
const producer = createFixtureProducer(store);
const keyboard=terminalInput(process.stdin);
process.stdout.write('\x1b[?2004h');
const instance = render(createElement(App, { store, producer }), { exitOnCtrlC: false,stdin:keyboard.input });

// A run that never exits would hang CI. The harness sends Ctrl+C when it is
// done, and this is the belt to that pair of braces.
const guard = setTimeout(() => process.exit(3), 60_000);
guard.unref?.();

instance.waitUntilExit().then(
  () => {keyboard.dispose();process.stdout.write('\x1b[?2004l');process.exit(0);},
  () => {keyboard.dispose();process.stdout.write('\x1b[?2004l');process.exit(1);},
);
