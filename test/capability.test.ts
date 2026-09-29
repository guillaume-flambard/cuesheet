import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

/** Null when the file cannot be read, so a mode-bit test can skip under root. */
const readFileSyncSafe = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

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

      const caps = new SkillsAdapter({ roots: [root] }).listCapabilities().capabilities;

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
      assert.equal(new SkillsAdapter({ roots: [root] }).listCapabilities().capabilities.length, 0);
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

      const caps = new SkillsAdapter({ roots: [absent, root] }).listCapabilities().capabilities;
      assert.equal(caps.length, 1, "the good root must not be lost to the bad one");
      assert.equal(caps[0].name, "good");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The three tests below are the regression net for a defect found by reading
  // this adapter: an unreadable SKILL.md returned null, and null is
  // indistinguishable from "this folder is not a skill". The capability went
  // missing with no error, which is the failure mode the whole registry
  // exists to make impossible.
  it("an unreadable SKILL.md is reported, not silently absent", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      const folder = join(root, "locked-skill");
      mkdirSync(folder, { recursive: true });
      const manifest = join(folder, "SKILL.md");
      writeFileSync(manifest, "name: locked-skill\n");
      chmodSync(manifest, 0o000);

      const listing = new SkillsAdapter({ roots: [root] }).listCapabilities();

      // Running as root defeats a mode-bit test, so assert the shape rather
      // than the specific error: a folder that could not be read is always
      // named in `unreadable` and never appears as a resolved capability.
      const reported = listing.unreadable.map((u) => u.folder);
      if (readFileSyncSafe(manifest) === null) {
        assert.deepEqual(reported, ["locked-skill"]);
        assert.equal(
          listing.capabilities.filter((c) => c.name === "locked-skill").length,
          0,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an unreadable root is not faked into a capability with a name", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      const absent = join(root, "does-not-exist");
      const listing = new SkillsAdapter({ roots: [absent] }).listCapabilities();
      assert.equal(listing.capabilities.length, 0, "no pseudo-capability");
      assert.equal(listing.anyRootUnreadable, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an unreadable root is observable without a pseudo-capability, and that is the only way in", () => {
    // The shape exists so a caller cannot silently drop the coverage half.
    // An adapter that returned Capability[] would let `resolveCapabilities`
    // infer "unverified" from an empty list alone, which is indistinguishable
    // from a registry that is genuinely empty.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      const listing = new SkillsAdapter({ roots: [join(root, "gone")] }).listCapabilities();
      assert.ok("capabilities" in listing);
      assert.ok("unreadable" in listing);
      assert.ok("anyRootUnreadable" in listing);
      assert.deepEqual(listing.capabilities, []);
      assert.equal(listing.anyRootUnreadable, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a readable but empty root is NOT flagged unverified: that is a real absence", () => {
    // The mirror image. If an empty-but-readable root were also marked
    // unverified, every clean machine would report "absence is not evidence"
    // and the warning would stop carrying information.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      const listing = new SkillsAdapter({ roots: [root] }).listCapabilities();
      assert.deepEqual(listing.capabilities, []);
      assert.equal(listing.anyRootUnreadable, false);
      const result = resolveCapabilities(
        [{ kind: "skill", name: "github-readme" }],
        listing.capabilities,
        { now: 1_757_000_000_000, registryUnverified: listing.anyRootUnreadable },
      );
      // An empty list alone still makes the core conservative, and that is
      // deliberate: it cannot tell, from an empty list, whether the adapter
      // looked. What the adapter supplies is the case where it knows it did.
      assert.equal(result.registryUnverified, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an unreadable root marks the resolution unverified, so absence is not evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-cap-"));
    try {
      const absent = join(root, "does-not-exist");
      const listing = new SkillsAdapter({ roots: [absent] }).listCapabilities();
      const result = resolveCapabilities(
        [{ kind: "skill", name: "github-readme" }],
        listing.capabilities,
        { now: 1_757_000_000_000, registryUnverified: listing.anyRootUnreadable },
      );
      assert.equal(result.verdict, "blocked");
      assert.equal(result.registryUnverified, true);
      assert.match(
        result.resolution.unresolved[0]!.reasons.join(" "),
        /absence here is not evidence/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
