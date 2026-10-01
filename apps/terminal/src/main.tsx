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

const instance = render(createElement(App), { exitOnCtrlC: false });

instance.waitUntilExit().then(
  () => process.exit(0),
  () => process.exit(1),
);
