/**
 * The surface state, as something React can subscribe to.
 *
 * The reason this file exists: `onEvent` fires from a promise continuation
 * outside React. A `useState` reducer driven by a callback in `App.tsx` cannot
 * represent that cleanly, because the events arrive when the loop decides to
 * send them rather than when a key is pressed.
 *
 * So the state moved out of React and the producer became the only writer. This
 * is the `useSyncExternalStore` shape rather than a force-update: React owns the
 * subscription and the tearing check, and there is no non-React re-render path
 * that could put the surface and the state out of step.
 *
 * `derive` stays the reducer. Nothing here decides anything; it holds the last
 * value of a pure function and tells React when it changed.
 */

import { useSyncExternalStore } from "react";
import { derive, emptySurface, type Control, type SurfaceState } from "./state.ts";

/** The store's own shape. Deliberately tiny: three functions and a value. */
export interface Store {
  /** Read the current state. Must return a stable reference between changes. */
  get(): SurfaceState;
  /** Ask for a control. The only way anything changes. */
  send(control: Control): void;
  /** Subscribe to changes. Returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
}

export function createStore(initial: SurfaceState = emptySurface): Store {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    send(control) {
      const next = derive(current, control);
      // Reference equality is the change test. `derive` returns the same object
      // for a control that changed nothing, which is what keeps a keystroke that
      // did not move the cursor from repainting the timeline.
      if (next === current) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

/** Read a store from a component. The only React-aware line in the state layer. */
export function useSurface(store: Store): SurfaceState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}