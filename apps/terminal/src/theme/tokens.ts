/**
 * The visual identity, as one place.
 *
 * Ghostty with truecolor, measured on the machine this runs on, which is why
 * these are 24-bit values rather than the 16-colour names every earlier version
 * used. A degraded palette on a terminal that can show real colour is the visual
 * equivalent of a surface that answers a question with a redirect: everything
 * works and nothing is what it should be.
 *
 * The rules, and they are short because a palette should not be a negotiation:
 *
 * ```text
 * one accent          it marks what is live and what can be acted on
 * four state colours  confirmed, active, unknown, failed
 * everything else     greys, and as few as possible
 * ```
 *
 * `unknown` is the one that matters here. This repository is careful about the
 * difference between "established" and "not established", and a surface that
 * paints both grey has thrown away the only thing it could have communicated.
 */

/** 24-bit colour, because the machine can show it. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

/** `truecolor` output, which is what Ghostty accepts. */
export const hex = (c: Rgb): string => `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

export const blend = (a: Rgb, b: Rgb, t: number): Rgb =>
  rgb(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
  );

/**
 * Ink takes named colours, so a hex has to be registered before use. Ink 4 has no
 * hex support, which is the whole reason this file exists rather than a palette
 * of strings.
 */
const REGISTERED = new Set<string>();

/** A colour name to hand Ink, derived from truecolor so the two cannot drift. */
export function inkColor(c: Rgb): string {
  const h = hex(c);
  if (!REGISTERED.has(h)) REGISTERED.add(h);
  return h;
}

export const theme = {
  /** The product's own name, and nothing else uses this. */
  brand: rgb(0x7d, 0xd3, 0xc0),

  /** What is certainly true. Deliberately quiet: certainty is the default. */
  confirmed: rgb(0x7d, 0xd3, 0xc0),
  /** What is happening right now. The only thing that moves. */
  active: rgb(0x74, 0xa8, 0xfc),
  /** What has not been established. Grey, and marked with a distinct glyph. */
  unknown: rgb(0x8b, 0x93, 0xa7),
  /** What failed. Present but not shouting. */
  failed: rgb(0xe0, 0x6c, 0x75),

  /** Body text, and the three greys below it. */
  text: rgb(0xd6, 0xdb, 0xe4),
  dim: rgb(0xb5, 0xbe, 0xcd),
  faint: rgb(0xa0, 0xaa, 0xba),
  /** Focus and code use a quiet surface, never a permanent panel. */
  focus: rgb(0x20, 0x30, 0x38),
  code: rgb(0x1b, 0x23, 0x2e),
  /** A hairline. Darker than `faint` on purpose: it is a border, not text. */
  rule: rgb(0x58, 0x65, 0x75),
} as const;

/** The four marks, and nothing else. A surface that draws more than this is a dashboard. */
export const glyph = {
  confirmed: "✓",
  active: "◇",
  unknown: "?",
  failed: "×",
  input: "›",
  /** The one rule of the house: no box drawing except the outer frame. */
  rule: "─",
} as const;

/** Colour a border or a separator with, which is the faintest thing on screen. */
export const ruleColor = theme.rule;
