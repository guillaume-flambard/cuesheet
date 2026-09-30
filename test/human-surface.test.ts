/**
 * The founding transcript, as a regression test.
 *
 * ```text
 * cwd = /Users/memo
 *
 * > hi
 * Hey.
 *
 * > le projet vidéo de mon pote
 * ```
 *
 * From that line on, the normal path must not contain a single word of internal
 * vocabulary. This is the test that matters most about the surface, and it is
 * the one the previous 322-line version could not have passed, because it had
 * already started printing `goal`, `project unresolved` and the like.
 *
 * The words below are banned in the greeting, in a bound resolution, in an
 * ambiguous question and in an unresolved one. They belong to `/inspect`, which
 * does not exist yet and will be built when someone asks for it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../apps/terminal/src/render.ts";

/** The internal vocabulary. None of it may appear on the normal path. */
const INTERNAL = [
  "goal",
  "staged",
  "unresolved",
  "state",
  "capabilities",
  "sessions on disk",
  "admission",
  "revision",
  "pendingEffect",
  "affordance",
  "read-set",
  "reconcil",
  "artifact",
  "INCONCLUSIVE",
  "workspace",
  "registry",
  "pending",
];

/** Characters that are part of the visual identity and must not be replaced. */
const GLYPHS = ["›", "◇", "✓", "…", "—", "→"];

function linesFor(slice: Parameters<typeof render>[0], typed = ""): string {
  return render(slice, typed).join("\n");
}

/** The slices this test needs, built from the real binding module. */
function boundSlice() {
  return {
    at: "bound",
    said: "le projet vidéo de mon pote",
    project: "friends-video",
    path: "products/friends-video",
  } as const;
}

function ambiguousSlice() {
  return {
    at: "ambiguous",
    said: "le projet vidéo de mon pote",
    binding: {
      kind: "unbound",
      candidates: [
        { path: "products/friends-video", name: "friends-video", basis: "name-token", tokens: ["video"], exists: true },
        { path: "experiments/video-lab", name: "video-lab", basis: "name-token", tokens: ["video"], exists: true },
      ],
    },
  } as const;
}

function unresolvedSlice() {
  return { at: "unresolved", said: "le projet vidéo de mon pote" } as const;
}

describe("the founding transcript, from $HOME", () => {
  it("the greeting says one thing and stops", () => {
    const out = linesFor({ at: "greeting" });
    assert.match(out, /cuesheet/);
    assert.match(out, /What are we working on\?/);
    for (const word of INTERNAL) {
      assert.doesNotMatch(out, new RegExp(word, "i"), `"${word}" leaked into the greeting`);
    }
    // The old surface printed here, and every line of it is a diagnosis.
    assert.doesNotMatch(out, /registry|unreadable|sessions|home directory|scope/);
  });

  it("a resolved project reads as a sentence, not as a state transition", () => {
    const out = linesFor(boundSlice());
    assert.match(out, /le projet vidéo de mon pote/, "the intention is echoed");
    assert.match(out, /friends-video/, "and the project is named");
    for (const word of INTERNAL) {
      assert.doesNotMatch(out, new RegExp(word, "i"), `"${word}" leaked into a bound resolution`);
    }
  });

  it("an ambiguous resolution asks a short question instead of printing candidates as state", () => {
    const out = linesFor(ambiguousSlice());
    assert.match(out, /Which one\?/);
    assert.match(out, /friends-video/);
    assert.match(out, /video-lab/);
    for (const word of INTERNAL) {
      assert.doesNotMatch(out, new RegExp(word, "i"), `"${word}" leaked into an ambiguity`);
    }
  });

  it("an unresolved project asks for a name, and never says the line was not a goal", () => {
    const out = linesFor(unresolvedSlice());
    assert.match(out, /Give me its name/);
    // The exact sentence the old surface printed, which was a lie about the
    // intention rather than a description of the scope.
    assert.doesNotMatch(out, /not a goal/i);
    for (const word of INTERNAL) {
      assert.doesNotMatch(out, new RegExp(word, "i"), `"${word}" leaked into an unresolved line`);
    }
  });

  it("the intention is echoed verbatim in every outcome", () => {
    const said = "le projet vidéo de mon pote";
    for (const slice of [boundSlice(), ambiguousSlice(), unresolvedSlice()]) {
      assert.match(linesFor(slice), new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});

describe("the visual identity is not negotiable", () => {
  it("the prompt glyph is the real one, not a substituted character", () => {
    // The previous version replaced `›` with `>` so that TypeScript would stop
    // complaining inside JSX. That is the design mutilating itself, and it is
    // checked here so it cannot come back.
    // The glyphs live in the render module and in the component's prompt line.
    // Both are checked, because the previous version kept them in the component
    // and that is where they were replaced.
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ["render.ts", "slice.tsx"]
      .map((f) => readFileSync(join(here, "..", "apps", "terminal", "src", f), "utf8"))
      .join("\n");

    assert.ok(sources.includes("\u203a"), "the prompt glyph is present in the source");
    assert.ok(sources.includes("\u2026"), "and the ellipsis, not three dots");
    assert.doesNotMatch(
      sources,
      /\[ok\]|\[v\]|\[a\]|\[b\]|\[x\]/,
      "no bracketed ASCII stand-in for a visual symbol",
    );
    assert.doesNotMatch(sources, /\.\.\.\s*\}/, "no three-dot ellipsis substituted for a real one");
  });

  it("the render is a pure function of the slice, so it can be read without a terminal", () => {
    // The property the 322-line version lacked: its output was only observable
    // by spawning Ink, which is why nothing about it could be asserted.
    const first = linesFor(boundSlice());
    const second = linesFor(boundSlice());
    assert.equal(first, second, "the same state renders the same words every time");
  });

  it("a long project list does not become a wall of text", () => {
    const many = {
      at: "ambiguous",
      said: "video",
      binding: {
        kind: "unbound",
        candidates: Array.from({ length: 12 }, (_, i) => ({
          path: `p${i}`,
          name: `project-${i}`,
          basis: "name-token",
          tokens: ["video"],
          exists: true,
        })),
      },
    } as const;
    const out = linesFor(many);
    assert.ok(out.split("\n").length < 24, "the question stays a question");
  });
});
