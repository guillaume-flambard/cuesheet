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
import { render, resolve } from "../apps/terminal/src/render.ts";

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
    const out = linesFor({ at: "welcome" });
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
    assert.match(out, /m'en dire plus|demander la liste/);
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


/**
 * OBS-1, the first counterexample a person found, on the first run.
 *
 * ```text
 * > on fait quoi ?
 * I can't tell which one you mean.
 * Give me its name, or its folder.
 * ```
 *
 * The surface had one interpretation of every line, and it was always "this
 * names a project". So a question about what to do was answered as a failed
 * directory lookup, which is the same shape as the old chat saying "not a goal"
 * about a stated intention: a helpful answer that asserts what the person meant,
 * and is wrong.
 *
 * The fix is not a better matcher. It is asking the router that has existed in
 * `core/intent.ts` all along, instead of asking the binder first and nobody
 * else.
 */
describe("OBS-1 a question is answered as a question", () => {
  it("a question about what to do is answered with a proposal, not a redirect", () => {
    const said = "on fait quoi ?";
    const slice = resolve(said);
    assert.equal(slice.at, "question", "the router recognises it as a question");
    const out = render(slice, "").join("\n");

    // OBS-2, on top of OBS-1. The first fix answered the question without
    // lying, and it was still wrong: "your projects are in ~/projects, name one"
    // hands the question straight back to the person who asked it. The surface
    // can read the portfolio, so it can propose.
    assert.doesNotMatch(out, /Name one and we|vos projets sont/i, "no redirect in any language");
    assert.doesNotMatch(out, /can't tell which one you mean/i, "no false claim either");
    assert.doesNotMatch(out, /~\/projects/, "and no directory listing in place of an answer");

    // A proposal with a reason. Five eligible projects, and the count of the
    // ones left out, because 29 held projects is the reason the list is short.
    assert.match(out, /libres a l'ecriture/, "it says what it knows");
    assert.match(out, /occupes, donc absents/, "and says why the list is short");
    assert.match(out, /\?$/m, "and offers a default, so the next word can be a name");
    // It has to NAME something. An answer with a count and a question mark but no
    // project in it is the redirect again, wearing a different hat.
    const named = slice.at === "question" ? slice.suggestions.map((s) => s.name) : [];
    assert.ok(named.length > 0, "at least one project is actually named");
    for (const name of named) {
      assert.ok(out.includes(name), `${name} is on screen, not just in the state`);
    }
    for (const word of INTERNAL) {
      assert.doesNotMatch(out, new RegExp(word, "i"), `"${word}" leaked into an answer to a question`);
    }
  });

  it("a question with nothing eligible says so instead of listing everything", () => {
    const empty = { at: "question", said: "on fait quoi ?", suggestions: [], held: 29 } as const;
    const out = render(empty, "").join("\n");
    assert.match(out, /held/);
    assert.doesNotMatch(out, /~\/projects/);
  });

  it("a greeting is not a project lookup either", () => {
    assert.equal(resolve("salut").at, "greeting");
    const out = render(resolve("salut"), "").join("\n");
    assert.doesNotMatch(out, /can't tell which one you mean/i);
  });

  it("a project name still binds, and an unknown name still asks", () => {
    assert.equal(resolve("cuesheet").at, "bound", "the path that worked still works");
    assert.equal(resolve("le projet video de mon pote").at, "unresolved");
  });

  it("the router is asked first, so a second classifier cannot drift", () => {
    // Read off the source: the question is settled before any binding happens.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "terminal", "src", "render.ts"),
      "utf8",
    );
    const routeAt = source.indexOf("routeIntention(");
    const bindAt = source.indexOf("bindProject(");
    assert.ok(routeAt > 0 && bindAt > 0, "both are called");
    assert.ok(routeAt < bindAt, "the router answers first, which is the whole fix");
  });
});


/**
 * OBS-3, the counter-example that reached the structure.
 *
 * ```text
 * > je sais pas
 * I don't know that one.
 * Name a project, or ask me what we're working on.
 * ```
 *
 * Five different answers, one message. Every one is a valid human reply to a
 * question, and every one was fed to the project binder as a directory path:
 *
 * ```text
 * "je sais pas"     -> I don't know that one.
 * "aucun"           -> I don't know that one.
 * "laisse tomber"   -> I don't know that one.
 * "montre-moi"      -> I don't know that one.
 * "aide"            -> I don't know that one.
 * ```
 *
 * The surface had one interpretation of every line, so a person who did not know
 * the answer was told that Cuesheet did not either, and then told what to type.
 *
 * The rule this file holds:
 *
 * > A clarification never constrains the shape of the answer.
 */
describe("OBS-3 a clarification never constrains the answer", () => {
  it("the five observed answers are five different turns, not one", () => {
    const cases: Array<[string, string]> = [
      ["je sais pas", "uncertain"],
      ["aucun", "uncertain"],
      ["laisse tomber", "cancelled"],
      ["montre-moi", "show-me"],
      ["aide", "help"],
    ];
    for (const [said, expected] of cases) {
      const slice = resolve(said);
      assert.equal(slice.at, expected, `"${said}" is a ${expected} turn`);
      const out = render(slice, "").join("\n");
      assert.doesNotMatch(
        out,
        /I don't know that one|Name a project, or ask me/i,
        `"${said}" was answered with the robotic redirect`,
      );
    }
  });

  it("uncertainty offers a project rather than repeating the question", () => {
    // The difference between an assistant and a form: not knowing is answered by
    // making choosing cheaper, not by asking again with the same expected answer.
    const out = render(resolve("je sais pas"), "").join("\n");
    assert.doesNotMatch(out, /Give me its name|Name a project/i, "no re-ask");
    const slice = resolve("je sais pas");
    if (slice.at !== "uncertain") return;
    assert.ok(slice.suggestions.length > 0, "it offers something to choose from");
    for (const s of slice.suggestions) {
      assert.ok(out.includes(s.name), `${s.name} is actually on screen`);
    }
  });

  it("cancelling ends the turn instead of asking for a project", () => {
    const out = render(resolve("laisse tomber"), "").join("\n");
    assert.match(out, /on laisse/i);
    assert.doesNotMatch(out, /Name a project|projects are in/i);
  });

  it("being asked for help does not become a project lookup", () => {
    const out = render(resolve("aide"), "").join("\n");
    assert.match(out, /projet/i, "it explains what it is for");
    assert.doesNotMatch(out, /I don't know that one/i);
  });

  it("the binder is never reached for a non-project turn", () => {
    // Read off the source: `readTurn` returns before `bindProject` can be
    // reached for these five, and a sixth phrase is not admitted until observed.
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "terminal", "src", "render.ts"),
      "utf8",
    );
    const turnAt = source.indexOf("readTurn(said)");
    const bindAt = source.indexOf("bindProject(said)");
    assert.ok(turnAt > 0 && bindAt > 0);
    assert.ok(turnAt < bindAt, "the turn is read before anything is bound");
  });
});
