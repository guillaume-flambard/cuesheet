import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REGISTRY_UNVERIFIED,
  describeBlock,
  isSpawnable,
  resolveCapabilities,
  type Capability,
  type CapabilityResolution,
  type Requirement,
} from "../src/core/capability.ts";
import { SkillsAdapter } from "../src/adapters/skills.ts";

const NOW = 1759000000000;

const skill = (name: string, version = "abc123def456"): Capability => ({
  kind: "skill",
  name,
  version,
  source: `/registry/${name}/SKILL.md`,
});

const req = (kind: string, name: string): Requirement => ({ kind, name });

const RESOLVE = (
  requirements: Requirement[],
  available: Capability[],
): CapabilityResolution =>
  resolveCapabilities(requirements, available, { now: NOW });

describe("resolveCapabilities", () => {
  it("the incident: a skill a started session cannot see is caught before spawn", () => {
    // github-readme did not exist when the three agents' sessions started, so
    // from wherever they were standing it was absent. Resolving now, not then.
    const registry = [skill("stasis"), skill("vault-audit")];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "blocked");
    assert.equal(isSpawnable(r), false);
    assert.equal(r.resolution.unresolved.length, 1);
  });

  it("resolves a requirement the registry offers", () => {
    const registry = [skill("github-readme")];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "ready");
    assert.equal(isSpawnable(r), true);
    assert.deepEqual(r.resolution.resolved, [registry[0]]);
    assert.deepEqual(r.resolution.unresolved, []);
  });

  it("no requirements is trivially ready", () => {
    const r = RESOLVE([], [skill("anything")]);

    assert.equal(r.verdict, "ready");
    assert.equal(r.resolution.resolved.length, 0);
  });

  it("an empty registry blocks, and reports that it could not be verified", () => {
    const r = RESOLVE([req("skill", "github-readme")], []);

    assert.equal(r.verdict, "blocked");
    assert.equal(r.registryUnverified, true);
    assert.match(r.resolution.unresolved[0].reasons[0], /not in the registry/);
    assert.match(
      r.resolution.unresolved[0].reasons.join(" "),
      /registry could not be verified/,
    );
  });

  it("a registry of unverified markers means absence is not evidence", () => {
    const unreadable: Capability[] = [
      { kind: "skill", name: "anything", version: REGISTRY_UNVERIFIED, source: "?" },
    ];
    const r = RESOLVE([req("skill", "github-readme")], unreadable);

    assert.equal(r.verdict, "blocked");
    assert.equal(r.registryUnverified, true);
    assert.match(
      r.resolution.unresolved[0].reasons.join(" "),
      /not evidence the requirement is unsatisfiable/,
    );
  });

  it("one verified capability makes any absence a real absence", () => {
    const registry = [
      skill("known-good"),
      { kind: "skill", name: "x", version: REGISTRY_UNVERIFIED, source: "?" },
    ];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "blocked");
    assert.equal(r.registryUnverified, false);
    assert.doesNotMatch(
      r.resolution.unresolved[0].reasons.join(" "),
      /could not be verified/,
    );
  });

  it("kinds never cross-resolve", () => {
    const registry: Capability[] = [
      { kind: "tool", name: "github-readme", version: "abc", source: "x" },
    ];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "blocked");
    assert.match(
      r.resolution.unresolved[0].reasons[0],
      /required skill "github-readme"/,
    );
  });

  it("no fuzzy matching: a near name is still a block", () => {
    const registry = [skill("github-readme-ext")];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "blocked");
  });

  it("the reasons name what IS available, so the caller can act, not guess", () => {
    const registry = [skill("stasis"), skill("vault-audit")];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    const ground = r.resolution.unresolved[0].reasons.find((s) =>
      s.startsWith("registered skill:"),
    );
    assert.ok(ground, "the alternatives must be named");
    assert.match(ground as string, /stasis, vault-audit/);
  });

  it("a duplicate registration resolves to the first, which adapters keep newest", () => {
    const registry = [skill("github-readme", "old"), skill("github-readme", "new")];
    const r = RESOLVE([req("skill", "github-readme")], registry);

    assert.equal(r.verdict, "ready");
    assert.equal(r.resolution.resolved[0].version, "old");
  });

  it("describeBlock states each failure and, for an empty kind, that nothing exists", () => {
    const r = RESOLVE(
      [req("skill", "github-readme"), req("tool", "github")],
      [skill("stasis")],
    );

    const msg = describeBlock(r);
    assert.match(msg, /cannot resolve skill "github-readme"/);
    assert.match(msg, /cannot resolve tool "github": no tool capability is registered at all/);
  });

  it("describeBlock on a full resolution is empty, not a paragraph", () => {
    const r = RESOLVE([req("skill", "github-readme")], [skill("github-readme")]);
    assert.equal(describeBlock(r), "");
  });
});

describe("SkillsAdapter", () => {
  it("reads the frontmatter name, not the folder name", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      mkdirSync(join(root, "folder-name"), { recursive: true });
      writeFileSync(
        join(root, "folder-name", "SKILL.md"),
        "---\nname: real-name\n---\n\nBody text.\n",
      );

      const caps = new SkillsAdapter({ roots: [root] }).listCapabilities();

      assert.equal(caps.length, 1);
      assert.equal(caps[0].kind, "skill");
      assert.equal(caps[0].name, "real-name");
      assert.match(caps[0].version, /^[0-9a-f]{12}$/);
      assert.equal(caps[0].source, join(root, "folder-name"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a folder without SKILL.md is not a skill", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      mkdirSync(join(root, "empty-folder"), { recursive: true });
      assert.equal(new SkillsAdapter({ roots: [root] }).listCapabilities().length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a missing root is skipped, and a real root alongside it still scans", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      mkdirSync(join(root, "good"), { recursive: true });
      writeFileSync(join(root, "good", "SKILL.md"), "name: good\n");
      const absent = join(root, "does-not-exist");

      const caps = new SkillsAdapter({ roots: [absent, root] }).listCapabilities();
      assert.equal(caps.length, 1, "the good root must not be lost to the bad one");
      assert.equal(caps[0].name, "good");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
