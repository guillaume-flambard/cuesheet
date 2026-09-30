/**
 * The executable entry point of the human surface.
 *
 * Kept separate from `slice.tsx` so the component stays importable and the
 * words stay testable: `node --test` cannot load a `.tsx`, which is why the
 * render lives in `render.ts` and this file does nothing but mount it.
 *
 * Three lines of behaviour, and the third is the one that matters:
 *
 * ```text
 * mount the surface
 * wait for the person
 * exit 0 on a clean Ctrl-C, because leaving is not a failure
 * ```
 */

import { createElement } from "react";
import { render } from "ink";
import { Slice_ } from "./slice.tsx";

const instance = render(createElement(Slice_));

// A killed child reports a signal, and Ink's own exit path is the clean one.
instance.waitUntilExit().then(
  () => process.exit(0),
  () => process.exit(1),
);
