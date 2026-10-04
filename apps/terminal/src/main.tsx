/**
 * The entry point.
 *
 * Two responsibilities and nothing else: mount the shell, and put the terminal
 * back the way it was found. The second one matters more than it looks, because a
 * TUI that leaves the cursor hidden or the alternate screen active makes the shell
 * unusable afterwards, and that is a failure a person notices once and remembers.
 */

import { createElement } from "react";
import { render } from "ink";
import { App } from "./app/App.tsx";
import {terminalInput} from "./terminal-input.ts";

const keyboard=terminalInput(process.stdin);
const mouse=process.stdout.isTTY;
if(mouse)process.stdout.write("\x1b[?1000h\x1b[?1006h\x1b[?2004h");
const cleanup=()=>{if(mouse)process.stdout.write("\x1b[?1000l\x1b[?1006l\x1b[?2004l");keyboard.dispose();};
const instance = render(createElement(App), { exitOnCtrlC: false, stdin:keyboard.input });

instance.waitUntilExit().then(
  () => {cleanup();process.exit(0);},
  () => {cleanup();process.exit(1);},
);
