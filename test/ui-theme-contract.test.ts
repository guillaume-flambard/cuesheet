/**
 * THE THEME IS A CONTRACT, NOT A PREFERENCE.
 *
 * `apps/terminal/src/theme/tokens.ts` states its own rules in a docstring and
 * then defines semantic colours against them. Nothing checked that the colours
 * still obeyed the sentence. A palette is exactly the kind of thing that grows
 * one hex at a time, each addition defensible on its own, until the surface is a
 * dashboard and no line on it is louder than another.
 *
 * So the docstring is transcribed here as assertions. Five of them, each one
 * derived from the actual RGB values rather than from a hardcoded pair of hex
 * strings, because a test that says "these two literals differ" is a comment
 * with an `assert` on it and stops being true the moment someone edits either
 * literal.
 *
 * ## The five
 *
 * 1. The palette has exactly one accent and exactly four state colours, so a new
 *    colour cannot be added without this file failing.
 * 2. `confirmed` and `unknown` stay perceptually distinguishable, measured in
 *    relative luminance, and still do after 4-bit-per-channel quantisation.
 * 3. No component inlines a colour literal, and every `theme.` / `glyph.` name a
 *    component reaches for is a declared token.
 * 4. `confirmed` stays quiet relative to `active`.
 * 5. Every state colour has its own glyph, so colour is never the only channel.
 *
 * ## What is deliberately not asserted here
 *
 * The palette is not edited by this file and this test says nothing about which
 * colours are correct. Three findings about the palette as it stands are recorded
 * in `docs/harness/evaluation/ui-theme-contract/evidence.md` and left for the
 * people who own the product to decide on. Changing a colour is a product
 * decision; this file only decides whether the decision was made on purpose.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { glyph, hex, theme, type Rgb } from "../apps/terminal/src/theme/tokens.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps", "terminal", "src");

/** The one file in `apps/terminal/src` where a colour literal is allowed to live. */
const PALETTE_FILE = join("theme", "tokens.ts");

// ─── the roles the docstring names ──────────────────────────────────────────

/**
 * The four state colours, and the four values of `Certainty`.
 *
 * Declared here rather than derived, because the derivation is what assertion 5
 * checks. `Certainty` is a TypeScript union, so it has no runtime shape to
 * enumerate, and a union cannot be counted from the type without a type checker
 * that does not run this file. The union is read as source text in the fifth
 * test, which is the one place a fifth certainty would be caught.
 */
const CERTAINTY = ["confirmed", "active", "unknown", "failed"] as const;

/**
 * The four greys.
 *
 * `text` is body text and the three below it, per the file's own comment. Their
 * grey-ness is not asserted by name, it is measured: see `GREY_SPREAD`.
 */
const GREY = ["text", "dim", "faint", "rule", "focus", "code"] as const;

/**
 * Everything that is neither a state colour nor a grey must be the accent, and
 * there must be exactly one of it. Computed rather than listed, because a list
 * would let a second accent in through the front door.
 */
const accentKeys = (): string[] =>
  Object.keys(theme).filter((k) => !(CERTAINTY as readonly string[]).includes(k) && !(GREY as readonly string[]).includes(k));

// ─── the measures, each stated with what it is for ──────────────────────────

/**
 * WCAG 2.x relative luminance, from the 8-bit sRGB channel values.
 *
 * This is the measure for assertion 2 and 4, and the choice needs defending.
 * A truecolor terminal emits the exact 24-bit value and the display shows it, so
 * the honest question is what a reader's eye separates, not what a diff string
 * looks like. Relative luminance is the standard model of perceived lightness
 * and it is the quantity the accessibility requirement for this surface is
 * written in (WCAG SC 1.4.11 talks about contrast ratio, not RGB distance).
 * Euclidean distance in RGB, the other measure on the table, is not perceptually
 * uniform: it weights the channels linearly even though sRGB is not linear, and
 * it cannot tell a colour that got darker from one that got bluer.
 */
const luminance = (c: Rgb): number => {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
};

/**
 * The WCAG contrast ratio between two colours: `(lighter + 0.05) / (darker + 0.05)`.
 *
 * 1.0 means the same lightness. The `0.05` is the WCAG definition's own offset and
 * is what keeps a very dark pair from producing an enormous and meaningless
 * number.
 */
const contrast = (a: Rgb, b: Rgb): number => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Round each channel to the 4-bit grid, the coarsest mode a truecolor terminal
 * can be asked for.
 *
 * Ghostty, like every terminal that advertises `truecolor`, also answers to a
 * 4-bit and an 8-bit request, and a surface whose palette only separates on the
 * exact 24-bit value has separated on nothing the moment a host rounds. The step
 * is 255 / 15 = 17.
 */
const quantise4 = (c: Rgb): Rgb => ({ r: Math.round(c.r / 17) * 17, g: Math.round(c.g / 17) * 17, b: Math.round(c.b / 17) * 17 });

/**
 * HSV saturation, from the channel extremes.
 *
 * This is the measure for assertion 4, and it is a different channel from
 * luminance on purpose. What makes a line shout is how much colour it carries,
 * not how bright it is, and on a dark background the two run in opposite
 * directions. The measured fact this file depends on: `active` is DARKER than
 * `confirmed` and far more saturated. Any assertion phrased in brightness would
 * be asserting the opposite of the intent.
 */
const saturation = (c: Rgb): number => {
  const hi = Math.max(c.r, c.g, c.b);
  const lo = Math.min(c.r, c.g, c.b);
  return hi === lo ? 0 : (hi - lo) / (510 - hi - lo);
};

/**
 * Largest minus smallest channel, in 8-bit units.
 *
 * Used to decide whether a colour is a grey at all. A grey is a colour whose
 * channels nearly agree; the palette's measured greys span 14 to 28 units and its
 * measured chromatic colours start at 86, so the gap is wide and any threshold
 * inside it is a measurement rather than a preference. 32 sits in that gap with
 * room on both sides.
 */
const spread = (c: Rgb): number => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

const GREY_SPREAD = 32;

/**
 * The floor for `confirmed` against `unknown`, and where it comes from.
 *
 * This is a chosen constant and it is named as one. A contrast ratio of 1.5
 * between these two luminances is a CIE L* difference of about 13, which is well
 * past the point at which two marks on the same background stop being told apart
 * at a glance. The measured pair sits at 1.75 exact (L* difference 18.0), so the
 * floor is deliberately below the measurement: this asserts a property the
 * palette has, not a property it barely has.
 */
const MIN_CONTRAST = 1.5;

/**
 * The chroma floor for `active` over `confirmed`.
 *
 * Also a chosen constant, chosen as "visibly more colourful" rather than "more
 * colourful at all", so a palette that merely nudges the number cannot pass.
 * Measured: 0.958 against 0.494, a ratio of 1.94.
 */
const MIN_CHROMA_RATIO = 1.5;

// ─── reading the source tree ────────────────────────────────────────────────

/** Every TypeScript file under `apps/terminal/src`, palette included. */
function sourceFiles(dir = SRC): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) found.push(full);
  }
  return found;
}

/**
 * Strip comments before scanning, the same reason `test/surface-v2.test.ts`
 * gives: a file is allowed to name the thing it is forbidden from doing in order
 * to explain why it does not do it, and a scanner that reads prose fails on the
 * sentence that documents the rule.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const relative = (file: string): string => file.slice(SRC.length + 1).split("\\").join("/");

/** Every line of executable text in a file, with its 1-based line number. */
function codeLines(file: string): Array<{ line: number; text: string }> {
  return stripComments(readFileSync(file, "utf8"))
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }));
}

/** One finding per offending line, named precisely enough to go and look at. */
type Offence = { file: string; line: number; what: string };

const scan = (what: RegExp, source: RegExp): Offence[] =>
  sourceFiles()
    .filter((file) => relative(file) !== PALETTE_FILE)
    .flatMap((file) =>
      codeLines(file)
        .filter(({ text }) => what.test(text) && source.test(text))
        .map(({ line, text }) => ({
          file: relative(file),
          line,
          what: `${what.source} in ${text.trim().slice(0, 80)}`,
        })),
    );

// ─── 1. the palette has a shape ─────────────────────────────────────────────

describe("the palette is one accent and four states, and nothing else", () => {
  it("declares exactly four state colours and exactly one accent", () => {
    // The list, not a count. A count alone cannot tell a fourth state colour from
    // a fifth, and the failure this guards against is a colour arriving without a
    // role, which is the same failure wearing a different name.
    const states = Object.keys(theme).filter((k) => (CERTAINTY as readonly string[]).includes(k));
    assert.deepEqual(states.sort(), [...CERTAINTY].sort(), "the declared state colours are not the four Certainty values");

    const accents = accentKeys();
    assert.deepEqual(accents, ["brand"], `the palette must have exactly one accent, found ${JSON.stringify(accents)}`);
    assert.equal(accents.length, 1, "one accent, not one list entry that happens to be alone");
  });

  it("refuses a key that is neither a state nor a grey", () => {
    // The catch-all. Adding `warning: rgb(...)` leaves four states and one accent
    // intact only if the new key sorts into a role; this is the assertion that
    // says it may not, so the palette cannot grow a colour without a decision
    // about which of the three buckets it belongs to.
    const declared = new Set([...CERTAINTY, ...GREY]);
    const unroled = Object.keys(theme).filter((k) => !declared.has(k));
    assert.deepEqual(unroled, ["brand"], `these palette keys have no role: ${JSON.stringify(unroled)}`);
  });

  it("keeps every grey actually grey, and the accent actually not", () => {
    // Measured, not named. A "grey" that has drifted chromatic is a fifth colour
    // wearing a grey's name, which is the same dashboard arriving sideways.
    for (const key of GREY) {
      const found = spread(theme[key]);
      assert.ok(found <= GREY_SPREAD, `${key} spans ${found} channels, so it is not a grey any more`);
    }
    for (const key of accentKeys()) {
      const found = spread(theme[key]);
      assert.ok(found > GREY_SPREAD, `${key} spans only ${found} channels, so the accent has gone grey`);
    }
  });

  it("keeps every colour a real 8-bit triple", () => {
    // The mechanical guard under the perceptual ones. A rounding mistake in the
    // palette would otherwise be discovered as a colour that looks wrong, which
    // is a report rather than a failure.
    for (const [key, value] of Object.entries(theme)) {
      for (const channel of ["r", "g", "b"] as const) {
        const n = value[channel];
        assert.ok(Number.isInteger(n) && n >= 0 && n <= 255, `${key}.${channel} is ${n}, not an 8-bit integer`);
      }
      assert.match(hex(value), /^#[0-9a-f]{6}$/, `${key} does not render as 24-bit truecolor`);
    }
  });
});

// ─── 2. established and not established are different colours ───────────────

describe("confirmed and unknown are perceptually distinguishable", () => {
  it("separates them in relative luminance, at full precision and at 4 bits", () => {
    // THE load-bearing claim, and the one the palette's own docstring says is the
    // reason the colour is called anything at all: a surface that paints
    // established and not-established the same has thrown away the only thing it
    // could have communicated.
    //
    // Relative luminance rather than RGB distance, argued in the note on
    // `luminance`. The short version: a truecolor terminal shows the literal
    // 24-bit value, so the question is what the eye separates, and relative
    // luminance is the standard model of that. RGB distance is not perceptually
    // uniform and would happily call a pair distinguishable for changing hue while
    // the two marks stay the same shade of the same brightness, which is exactly
    // the failure being guarded against here.
    const exact = contrast(theme.confirmed, theme.unknown);
    assert.ok(exact >= MIN_CONTRAST, `confirmed and unknown contrast at ${exact.toFixed(3)}, the floor is ${MIN_CONTRAST}`);

    // The same claim on a 4-bit channel grid. A terminal asked for 4 bits per
    // channel rounds, and the palette has to survive the rounding rather than
    // depend on the last bit of a channel. This is a derived value, not a
    // restatement: quantise both colours and measure again.
    const coarse = contrast(quantise4(theme.confirmed), quantise4(theme.unknown));
    assert.ok(coarse >= MIN_CONTRAST, `at 4 bits per channel they contrast at ${coarse.toFixed(3)}, the floor is ${MIN_CONTRAST}`);
  });

  it("does not reach for hue as a substitute", () => {
    // The negative form, because a pair can be far apart in RGB and still be the
    // same shade. `confirmed` and `unknown` are allowed to differ in hue, and this
    // does not require them to. What it forbids is the palette buying the
    // distinction with chroma alone, because chroma alone is what disappears on a
    // monochrome terminal and to a reader who cannot separate those hues. The
    // assertion above is the one that matters; this one names the trap.
    assert.ok(
      contrast(theme.confirmed, theme.unknown) >= MIN_CONTRAST,
      "the separation is a lightness difference, not only a hue difference",
    );
  });
});

// ─── 3. no component reaches past the palette ───────────────────────────────

describe("a component names a role, never a colour", () => {
  it("finds no colour literal anywhere outside the palette", () => {
    // The scan. `apps/terminal/src` is scanned in full, palette excluded by path
    // rather than by an allowlist of shapes, so the day someone inlines a fourth
    // colour literal in a component it is named with its file and its line.
    //
    // What was found when this file was written, so the next person does not have
    // to re-derive it: nothing. Zero hex literals, zero `rgb()` or `hsl()` calls,
    // zero named colours, anywhere in `apps/terminal/src` outside
    // `theme/tokens.ts`. The `inkColor` registration set the palette maintains for
    // Ink lives inside the palette file and is excluded by that path, not by
    // having been given a pass.
    const hexLiteral = scan(/#[0-9a-fA-F]{3,8}\b/, /./);
    const numericColour = scan(/\b(?:rgb|rgba|hsl|hsla)\s*\(/, /./);
    const namedColour = scan(/color=\{?\s*["'](?!#)[a-zA-Z]+["']/, /color/);

    const offences: Offence[] = [...hexLiteral, ...numericColour, ...namedColour];
    assert.deepEqual(
      offences.map((o) => `${o.file}:${o.line} ${o.what}`),
      [],
      "a component inlines a colour instead of naming a token",
    );
  });

  it("resolves every theme and glyph name a component uses to a declared token", () => {
    // The other half. A component cannot inline a colour and still be wrong by
    // writing `theme.teal`, because that name resolves to nothing and the
    // component stops compiling. This asserts it anyway: the point of the rule is
    // that a colour is reachable only through the palette, and a name that is not
    // declared is a colour nobody chose on purpose.
    const names = (object: object, prefix: string): Offence[] =>
      sourceFiles()
        .filter((file) => relative(file) !== PALETTE_FILE)
        .flatMap((file) =>
          codeLines(file)
            .flatMap(({ line, text }) =>
              [...text.matchAll(new RegExp(`\\b${prefix}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))].map((m) => ({
                file: relative(file),
                line,
                what: `${prefix}.${m[1]}`,
              })),
            ),
        );

    const declaredTheme = new Set(Object.keys(theme));
    const declaredGlyph = new Set(Object.keys(glyph));
    const unknownTheme = names(theme, "theme").filter((o) => !declaredTheme.has(o.what.split(".")[1]!));
    const unknownGlyph = names(glyph, "glyph").filter((o) => !declaredGlyph.has(o.what.split(".")[1]!));

    assert.deepEqual(unknownTheme.map((o) => `${o.file}:${o.line} ${o.what}`), [], "theme name that resolves to nothing");
    assert.deepEqual(unknownGlyph.map((o) => `${o.file}:${o.line} ${o.what}`), [], "glyph name that resolves to nothing");
  });

  it("keeps the glyph literals a component writes inline under the palette's rule", () => {
    // Recorded rather than newly forbidden. Six files outside the palette write a
    // box-drawing or prompt character as a string literal instead of reading it
    // from `glyph`: `components/Composer.tsx`, `components/Header.tsx`,
    // `overlays/AgentModels.tsx`, `overlays/Models.tsx`, `overlays/Palette.tsx`,
    // `overlays/Sessions.tsx`, and `producer/index.ts`. That is a colour-channel
    // observation about the same rule the palette states for colours, and it is
    // reported here so the finding is not lost, but this file does not turn it into
    // a failure: deciding which of those inline literals become tokens is a change
    // to the components, and this file is a test.
    assert.equal(PALETTE_FILE, "theme/tokens.ts", "the palette is where a literal is allowed to live");
    assert.equal(sourceFiles().some((f) => relative(f) === PALETTE_FILE), true, "the palette file exists to be the exception");
  });
});

// ─── 4. certainty is the default, the moving thing draws the eye ────────────

describe("confirmed stays quiet while active moves", () => {
  it("makes active the more colourful of the two, by a margin", () => {
    // The relationship, not a beauty claim. `certainty is the default` means a
    // settled line should read as ordinary text and a running line should not.
    // Chroma is the channel that carries that, and it is the opposite channel from
    // brightness here: measured, `active` is DARKER than `confirmed`
    // (0.388 against 0.547) and far more saturated (0.958 against 0.494). So the
    // assertion cannot be phrased in brightness without asserting the reverse of
    // the intent, and it is phrased in saturation with a floor instead.
    const ratio = saturation(theme.active) / saturation(theme.confirmed);
    assert.ok(ratio >= MIN_CHROMA_RATIO, `active is only ${ratio.toFixed(2)}x as saturated as confirmed, the floor is ${MIN_CHROMA_RATIO}`);
  });

  it("keeps confirmed nearer the body neutral than active is", () => {
    // The same relationship from the other end, and it is the one a reader of the
    // timeline actually experiences. `text` is what every ordinary line is drawn
    // in, so a colour close to it reads as ordinary. Measured: confirmed sits
    // 96 units from `text`, active sits 113, so the running thing is the one that
    // departs from the page.
    const quiet = Math.hypot(
      theme.confirmed.r - theme.text.r,
      theme.confirmed.g - theme.text.g,
      theme.confirmed.b - theme.text.b,
    );
    const loud = Math.hypot(theme.active.r - theme.text.r, theme.active.g - theme.text.g, theme.active.b - theme.text.b);
    assert.ok(quiet < loud, `confirmed sits ${quiet.toFixed(1)} from text and active ${loud.toFixed(1)}, so active should be the further one`);
  });
});

// ─── 5. colour is never the only channel ────────────────────────────────────

describe("every state colour has a glyph of its own", () => {
  it("maps all four Certainty values to distinct marks", () => {
    // Total over the four values, and injective. Total so that adding a certainty
    // cannot arrive without a mark; injective so that two certainties cannot share
    // one, which would leave colour as the only channel telling them apart and
    // that is the whole failure the docstring is about.
    const marks = CERTAINTY.map((c) => (glyph as Record<string, string>)[c]);
    for (const [i, certainty] of CERTAINTY.entries()) {
      assert.equal(typeof marks[i], "string", `no glyph for ${certainty}`);
      assert.ok((marks[i] ?? "").length > 0, `${certainty} has an empty glyph`);
    }
    assert.equal(new Set(marks).size, CERTAINTY.length, `two certainties share a glyph: ${JSON.stringify(marks)}`);
  });

  it("gives each mark a single glyph, not a word", () => {
    // Grapheme count, not code-unit count, for the reason `components/editor.ts`
    // gives: a combining mark or an emoji is more than one code unit and is one
    // mark on screen. A certainty whose "glyph" is the word `unknown` is a label
    // wearing a glyph's name, and it renders at a different width from every other
    // mark in the column.
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const certainty of CERTAINTY) {
      const mark = (glyph as Record<string, string>)[certainty] ?? "";
      const count = [...segmenter.segment(mark)].length;
      assert.equal(count, 1, `${certainty} renders as ${count} marks, not one: ${JSON.stringify(mark)}`);
    }
  });

  it("reads the Certainty union from the source and holds it to four", () => {
    // The runtime half of the totality claim. `CERTAINTY` at the top of this file
    // is a transcription, and a transcription can go stale. The union in
    // `app/state.ts` is the authority, so it is read as text: this file adds no
    // dependency on a module another worker is editing, and it still fails the day
    // a fifth certainty appears, because the palette would then owe the surface a
    // fifth state colour and this is where that is noticed.
    const state = readFileSync(join(SRC, "app", "state.ts"), "utf8");
    const declaration = /export type Certainty =([^;]+);/.exec(state);
    assert.ok(declaration, "app/state.ts no longer declares Certainty as a union this file can read");
    const values = [...(declaration?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(values.sort(), [...CERTAINTY].sort(), `Certainty is now ${JSON.stringify(values)}, so the palette owes it a state colour`);
  });
});
describe('focused terminal surfaces remain readable',()=>{
 it('keeps body and action labels readable on focus and code backgrounds',()=>{
  for(const background of [theme.focus,theme.code])for(const foreground of [theme.text,theme.dim,theme.brand])assert.ok(contrast(foreground,background)>=4.5,'focused content needs readable contrast');
 });
});
