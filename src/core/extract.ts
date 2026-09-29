/**
 * Core: extract declared capability requirements from prose.
 *
 * This exists because of an asymmetry the historical replay exposed. Matching
 * brief text against names that are already in the registry can only ever find
 * requirements for skills that exist, so a brief naming a skill that does not
 * exist yet is invisible to that method, which is precisely the incident this
 * project was built around. The extractor therefore works on the text itself:
 * a requirement is declared when the prose says "load the X skill" or quotes
 * X next to the word skill, whether or not X exists anywhere.
 *
 * Two honest limits, both visible in the return value rather than hidden:
 *
 * 1. Directive-shaped matches ("load the X skill") and bare mentions ("the X
 *    skill handles this") are returned with different `declared` confidence,
 *    because a mention is context and a directive is an instruction. Collapsing
 *    them would inflate the requirement count.
 *
 * 2. The match is over a bounded window of the text, because a brief can be
 *    long and the patterns that matter live in its instruction lines.
 *
 * The patterns are deliberately narrow. A wide pattern that flagged every word
 * next to "skill" would produce a would-block on nearly every session, and a
 * shadow measurement dominated by false positives measures the detector, not
 * the harness.
 */

import type { Requirement } from "./capability.ts";

export interface RequirementMatch {
  name: string;
  /** The text around the match, for audit. Never parsed downstream. */
  snippet: string;
  /** True for an instruction to use the skill; false for a bare mention. */
  directive: boolean;
}

export interface Extraction {
  requirements: Requirement[];
  matches: RequirementMatch[];
}

/** How much surrounding text is kept for audit. */
const SNIPPET = 60;

const NAME = "[a-z0-9][a-z0-9_-]{1,48}";

/**
 * Directive first: an instruction to use, load, run or follow a skill, with
 * the name optionally quoted. Then the quoted-adjacent form, which is a
 * requirement even without an explicit verb, because a backticked name beside
 * the word "skill" is how briefs name a specific skill.
 */
const PATTERNS: Array<{ re: RegExp; directive: boolean }> = [
  {
    re: new RegExp(
      `(?:load|use|run|follow|apply|read|consult|invoke|via|using)\\s+(?:the\\s+)?[\`"']?(${NAME})[\`"']?\\s+skills?\\b`,
      "gi",
    ),
    directive: true,
  },
  {
    re: new RegExp(`[\`"'](${NAME})[\`"']\\s+skills?\\b`, "gi"),
    directive: false,
  },
  {
    re: new RegExp(`skills?\\s+(?:named|called)\\s+[\`"']?(${NAME})[\`"']?`, "gi"),
    directive: true,
  },
];

export function extractSkillRequirements(text: string): Extraction {
  if (!text) {
    return { requirements: [], matches: [] };
  }

  // Preprocessing has two rules, and getting them backwards cost a failed
  // test on the incident fixture itself:
  //
  // - A fenced block is documentation about skills, never an instruction to
  //   load one, so it is removed. This exact confusion produced a false claim
  //   in the benchmark's V1 scorer before it was caught there.
  // - An inline code span that holds exactly a name is the standard way a
  //   brief writes "load the `github-readme` skill", so it is KEPT: the name
  //   lives inside the backticks. An inline span that holds a sentence is a
  //   reference, not an instruction, so it is neutralised. Stripping every
  //   span instead deleted the name and left "load the   skill", which the
  //   directive pattern then parsed with "the" as the skill name.
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`\n]+)`/g, (_all, inner: string) =>
      new RegExp(`^${NAME}$`).test(inner.trim()) ? "`" + inner.trim() + "`" : " ",
    );

  const byName = new Map<string, RequirementMatch>();

  for (const { re, directive } of PATTERNS) {
    for (const match of prose.matchAll(re)) {
      const name = match[1];
      if (!name) continue;
      const start = Math.max(0, (match.index ?? 0) - SNIPPET);
      const snippet = prose.slice(start, (match.index ?? 0) + match[0].length + SNIPPET).trim();

      const existing = byName.get(name);
      // A directive outranks a bare mention for the same name.
      if (!existing || (directive && !existing.directive)) {
        byName.set(name, { name, snippet, directive });
      }
    }
  }

  const matches = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    requirements: matches.map((m) => ({ kind: "skill", name: m.name })),
    matches,
  };
}
