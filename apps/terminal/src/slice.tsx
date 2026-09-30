/**
 * The vertical slice: one path, done properly.
 *
 * $HOME -> cuesheet -> greeting -> a sentence in plain French -> the portfolio
 * resolves it -> the project is chosen -> a prompt ready to work.
 *
 * Nothing else. No history, no artifacts, no verification panel, no command
 * palette. Those are states nobody has used yet, and building them now is how
 * a surface ends up polished around twenty states and still wrong.
 *
 * The previous version of this file was 322 lines of Ink, it did not compile,
 * and it had already begun replacing the visual identity with ASCII so that
 * TypeScript would accept it, one symbol at a time, until the surface looked
 * like a different product. That is the design mutilating itself to satisfy the
 * compiler, which is the exact inversion of the point. So this file is rebuilt
 * small, keeps the glyphs, and lets the render be a pure function of state so
 * it can be read in a test without a terminal.
 */

import { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { useInput } from "ink";
import { bindProject, type Binding } from "../../../src/adapters/project-binding.ts";
import { snapshotPortfolio } from "../../../src/adapters/frontier.ts";

// ─── the slice's states ────────────────────────────────────────────────────

type Slice =
  | { readonly at: "greeting" }
  | { readonly at: "resolving" }
  | { readonly at: "ambiguous"; readonly said: string; readonly binding: Binding }
  | { readonly at: "unresolved"; readonly said: string }
  | { readonly at: "bound"; readonly said: string; readonly project: string; readonly path: string }
  | { readonly at: "refused"; readonly said: string };

/**
 * The one decision this slice makes: is this sentence about a project, and
 * which one. It delegates, because BIND-01 through BIND-06 already live in
 * `project-binding.ts` and re-deciding them here would create a second opinion.
 */
function resolve(said: string): Slice {
  const binding = bindProject(said, snapshotPortfolio());
  if (binding.kind === "bound") {
    return { at: "bound", said, project: binding.candidate.name, path: binding.candidate.path };
  }
  if (binding.kind === "unbound" && binding.candidates.length > 1) {
    return { at: "ambiguous", said, binding };
  }
  return { at: "unresolved", said };
}

// ─── the render ────────────────────────────────────────────────────────────

const ACCENT = "cyan";
const MUTED = "gray";

/**
 * What a person sees. A pure function of the slice, so every line below is
 * assertable without spawning a terminal, which is the property the last
 * version did not have.
 */
export function render(slice: Slice, typed: string): string[] {
  switch (slice.at) {
    case "greeting":
      return ["", "  cuesheet", "", "  What are we working on?", ""];

    case "resolving":
      return [`  ${typed}`, "", "  Looking through your projects…", ""];

    case "ambiguous":
      return [
        `  ${slice.said}`,
        "",
        `  I can see ${count(slice.binding.candidates.length, "project")} that could be it:`,
        "",
        ...slice.binding.candidates.map((c) => `    ${c.name}  ${MUTED_MARK}${c.path}`),
        "",
        "  Which one?",
        "",
      ];

    case "unresolved":
      return [
        `  ${slice.said}`,
        "",
        "  I can't tell which one you mean.",
        "  Give me its name, or its folder.",
        "",
      ];

    case "bound":
      return [
        `  ${slice.said}`,
        "",
        `  ${slice.project}  ${MUTED_MARK}${slice.path}`,
        "",
        "  What do you want to look at?",
        "",
      ];

    case "refused":
      return [`  ${slice.said}`, "", "  Ask me about a project and we can start there.", ""];
  }
}

const MUTED_MARK = "  ";
const count = (n: number, word: string) => (n === 1 ? `one ${word}` : `${n} ${word}s`);

// ─── the terminal ──────────────────────────────────────────────────────────

export function Slice_() {
  const { exit } = useApp();
  const [slice, setSlice] = useState<Slice>({ at: "greeting" });
  const [typed, setTyped] = useState("");

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();
    if (key.return) {
      const said = typed.trim();
      if (!said) return;
      setSlice({ at: "resolving" });
      // A real resolution reads git, so it is not instantaneous. The pause is
      // not decoration: it is the honest shape of a question that hits the disk.
      setTimeout(() => setSlice(resolve(said)), 120);
      return;
    }
    if (key.backspace || key.delete) return setTyped((t) => t.slice(0, -1));
    if (key.escape) return setTyped("");
    if (!key.ctrl && !key.meta && input) setTyped((t) => t + input);
  });

  const lines = render(slice, typed);

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={line.includes("cuesheet") ? ACCENT : undefined}>
          {line}
        </Text>
      ))}
      {slice.at === "greeting" || slice.at === "ambiguous" || slice.at === "unresolved" ? (
        <Text>
          <Text color={ACCENT} bold>
            {"› "}
          </Text>
          {typed}
          <Text inverse>{" "}</Text>
        </Text>
      ) : null}
    </Box>
  );
}
