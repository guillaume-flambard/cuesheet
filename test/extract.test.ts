import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractSkillRequirements } from "../src/core/extract.ts";

describe("extractSkillRequirements", () => {
  // The admission fixture: the real text of the 2026-09-29 incident, taken
  // from the session database rather than reconstructed. At the time of the
  // incident `github-readme` did not exist in the registry, which is exactly
  // why name-against-registry matching could never have seen this.
  it("the incident: 'load the `github-readme` skill' is a directive requirement", () => {
    const text =
      "Make the public GitHub page of `uni-protocol` impeccable.\n\n" +
      "STEP 1, before anything else: load the `github-readme` skill and follow it.";

    const r = extractSkillRequirements(text);

    assert.deepEqual(
      r.requirements.map((q) => q.name),
      ["github-readme"],
    );
    const match = r.matches[0];
    assert.equal(match.directive, true, "load is an instruction, not a mention");
    assert.match(match.snippet, /load the `github-readme` skill/);
  });

  it("a bare quoted mention is a requirement with lower confidence", () => {
    const r = extractSkillRequirements("The `humanizer` skill covers the voice rules.");
    assert.deepEqual(r.requirements.map((q) => q.name), ["humanizer"]);
    assert.equal(r.matches[0].directive, false);
  });

  it("'use the X skill' with no quotes is still a directive", () => {
    const r = extractSkillRequirements("Use the tdd skill for this change.");
    assert.deepEqual(r.requirements.map((q) => q.name), ["tdd"]);
    assert.equal(r.matches[0].directive, true);
  });

  it("'skill named X' is a directive", () => {
    const r = extractSkillRequirements("There is a skill named qa-only that reports without fixing.");
    assert.deepEqual(r.requirements.map((q) => q.name), ["qa-only"]);
    assert.equal(r.matches[0].directive, true);
  });

  it("plural skills with a list of names are each extracted", () => {
    const r = extractSkillRequirements("Load the `cso` skill and the `security-arsenal` skill.");
    assert.deepEqual(
      r.requirements.map((q) => q.name).sort(),
      ["cso", "security-arsenal"],
    );
  });

  it("a name inside a code fence is documentation, not an instruction", () => {
    const text = [
      "Steps:",
      "```",
      "load the `some-skill` skill",
      "```",
      "Then run the tests.",
    ].join("\n");
    assert.deepEqual(extractSkillRequirements(text).requirements, []);
  });

  it("an inline code span is stripped, for the same reason", () => {
    const text = "Reference: `run the fake-skill skill` in the docs.";
    assert.deepEqual(extractSkillRequirements(text).requirements, []);
  });

  it("a word next to 'skill' that is not quoted and not directed is not a requirement", () => {
    // "agent skill handling" or prose like "skills are loaded" must not
    // manufacture a requirement named `agent` or `loaded`.
    const r = extractSkillRequirements("Skills are loaded at session start in this runtime.");
    assert.deepEqual(r.requirements, []);
  });

  it("prose with no skill references extracts nothing", () => {
    const r = extractSkillRequirements("Fix the failing test in packages/core/src/index.ts.");
    assert.deepEqual(r.requirements, []);
    assert.deepEqual(r.matches, []);
  });

  it("a directive outranks a bare mention for the same name", () => {
    const text = "The `k1` skill exists. Load the `k1` skill before writing.";
    const r = extractSkillRequirements(text);
    assert.equal(r.requirements.length, 1);
    assert.equal(r.matches[0].directive, true);
  });

  it("an empty or whitespace text extracts nothing", () => {
    assert.deepEqual(extractSkillRequirements("").requirements, []);
    assert.deepEqual(extractSkillRequirements("   \n  ").requirements, []);
  });

  it("the extractor is not fooled by the word 'skills' alone", () => {
    const r = extractSkillRequirements("No skills here, just work.");
    assert.deepEqual(r.requirements, []);
  });
});
