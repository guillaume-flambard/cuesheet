import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseRequirements,
  preflightDelegation,
  RequirementsFormatError,
} from "../src/core/delegation.ts";
import { REGISTRY_UNVERIFIED, type Capability } from "../src/core/capability.ts";

const NOW = 1759000000000;

describe("parseRequirements", () => {
  it("reads kind and name out of a valid declaration", () => {
    const r = parseRequirements(
      JSON.stringify({ requirements: [{ kind: "skill", name: "github-readme" }] }),
    );
    assert.deepEqual(r, [{ kind: "skill", name: "github-readme" }]);
  });

  it("an empty requirements list is valid, and means trivially ready", () => {
    assert.deepEqual(parseRequirements('{"requirements": []}'), []);
  });

  it("extra keys are ignored, so a brief can carry its own context", () => {
    const r = parseRequirements(
      JSON.stringify({
        brief: "port the README",
        requirements: [{ kind: "skill", name: "github-readme", note: "must" }],
      }),
    );
    assert.deepEqual(r, [{ kind: "skill", name: "github-readme" }]);
  });

  it("a bare top-level array is rejected, with the fix named", () => {
    assert.throws(
      () => parseRequirements('[{"kind": "skill", "name": "x"}]'),
      (e: unknown) =>
        e instanceof RequirementsFormatError && /bare array/.test(e.message),
    );
  });

  it("a declaration without a requirements array is rejected", () => {
    assert.throws(
      () => parseRequirements('{"brief": "x"}'),
      (e: unknown) =>
        e instanceof RequirementsFormatError && /"requirements" array/.test(e.message),
    );
  });

  it("an element whose kind is not a non-empty string is rejected, naming the element", () => {
    assert.throws(
      () => parseRequirements('{"requirements": [{"kind": 3, "name": "x"}]}'),
      (e: unknown) =>
        e instanceof RequirementsFormatError && /requirement 0: "kind"/.test(e.message),
    );
  });

  it("an element whose name is missing or blank is rejected", () => {
    for (const bad of ['{"kind": "skill"}', '{"kind": "skill", "name": "   "}']) {
      assert.throws(
        () => parseRequirements(`{"requirements": [${bad}]}`),
        (e: unknown) =>
          e instanceof RequirementsFormatError && /"name" must be a non-empty string/.test(e.message),
      );
    }
  });

  it("an element that is not an object is rejected", () => {
    assert.throws(
      () => parseRequirements('{"requirements": ["github-readme"]}'),
      (e: unknown) =>
        e instanceof RequirementsFormatError && /requirement 0 is not an object/.test(e.message),
    );
  });
});

describe("preflightDelegation", () => {
  const cap = (name: string, version = "abc123def456"): Capability => ({
    kind: "skill",
    name,
    version,
    source: `/registry/${name}`,
  });
  const req = (kind: string, name: string) => ({ kind, name });

  it("satisfied requirements spawn, with an empty refusal and the resolved capabilities", () => {
    const registry = [cap("github-readme"), cap("stasis")];
    const p = preflightDelegation(
      [req("skill", "github-readme")],
      registry,
      { now: NOW },
    );

    assert.equal(p.spawnable, true);
    assert.equal(p.refusal, "");
    assert.deepEqual(p.resolution.resolution.resolved, [registry[0]]);
  });

  it("one missing requirement blocks, and the refusal names it and the alternatives", () => {
    const p = preflightDelegation(
      [req("skill", "github-readme")],
      [cap("stasis"), cap("vault-audit")],
      { now: NOW },
    );

    assert.equal(p.spawnable, false);
    assert.match(p.refusal, /cannot resolve skill "github-readme"/);
    assert.match(p.refusal, /registered skill: stasis, vault-audit/);
  });

  it("a registry that could not be verified says absence is not evidence", () => {
    // The unreadable-root shape: the adapter hands back unverified markers
    // instead of inventing an empty registry.
    const unreadable: Capability[] = [
      { kind: "skill", name: "anything", version: REGISTRY_UNVERIFIED, source: "?" },
    ];
    const p = preflightDelegation([req("skill", "github-readme")], unreadable, {
      now: NOW,
    });

    assert.equal(p.spawnable, false);
    assert.equal(p.resolution.registryUnverified, true);
    assert.match(p.refusal, /absence here is not evidence/);
  });

  it("a requirement crossing kinds is blocked, never fuzzy-matched across kinds", () => {
    const p = preflightDelegation(
      [req("tool", "github-readme")],
      [cap("github-readme")],
      { now: NOW },
    );

    assert.equal(p.spawnable, false);
    assert.match(
      p.refusal,
      /cannot resolve tool "github-readme": no tool capability is registered at all/,
    );
  });

  it("no declared requirements is trivially spawnable", () => {
    const p = preflightDelegation([], [cap("stasis")], { now: NOW });
    assert.equal(p.spawnable, true);
    assert.equal(p.refusal, "");
  });
});

describe("the CLI requirements gate", () => {
  const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  };

  const withWorkspace = (fn: (root: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-gate-"));
    try {
      fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const writeSkillRoot = (root: string, name: string): string => {
    const skills = join(root, "skills");
    mkdirSync(join(skills, name), { recursive: true });
    writeFileSync(join(skills, name, "SKILL.md"), `---\nname: ${name}\n---\nbody\n`);
    return skills;
  };

  const writeRequirements = (root: string, payload: string | unknown): string => {
    const file = join(root, "requirements.json");
    writeFileSync(
      file,
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
    return file;
  };

  it("satisfied requirements exit 0 and print a ready verdict", () => {
    withWorkspace((root) => {
      const skills = writeSkillRoot(root, "github-readme");
      const file = writeRequirements(root, {
        requirements: [{ kind: "skill", name: "github-readme" }],
      });

      const r = run(["--requirements", file, "--skill-root", skills]);
      assert.equal(r.code, 0);
      assert.match(r.out, /ok      skill "github-readme" [0-9a-f]{12}/);
      assert.match(r.out, /conformance verdict: ready \(1 of 1 resolved\)/);
    });
  });

  it("one missing requirement exits 1, names it, and names the alternatives", () => {
    withWorkspace((root) => {
      const skills = writeSkillRoot(root, "good-skill");
      const file = writeRequirements(root, {
        requirements: [
          { kind: "skill", name: "ghost-skill" },
          { kind: "skill", name: "good-skill" },
        ],
      });

      const r = run(["--requirements", file, "--skill-root", skills]);
      assert.equal(r.code, 1);
      assert.match(r.out, /BLOCKED skill "ghost-skill": required skill "ghost-skill" is not in the registry/);
      assert.match(r.out, /registered skill: good-skill/);
      assert.match(r.out, /conformance verdict: blocked \(1 of 2 resolved\): do not spawn/);
    });
  });

  it("an unreadable skill root blocks, and the message says absence is not evidence", () => {
    withWorkspace((root) => {
      const file = writeRequirements(root, {
        requirements: [{ kind: "skill", name: "github-readme" }],
      });
      const missing = join(root, "does-not-exist");

      const r = run(["--requirements", file, "--skill-root", missing]);
      assert.equal(r.code, 1);
      assert.match(r.out, /no skill capability is registered at all/);
      assert.match(r.out, /the registry could not be verified, so absence here is not evidence/);
      assert.match(r.out, /conformance verdict: blocked \(0 of 1 resolved\): do not spawn/);
    });
  });

  it("--requirements without a value exits 2", () => {
    const r = run(["--requirements"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /--requirements needs a file path/);
  });

  it("--requirements without a skill root exits 2", () => {
    withWorkspace((root) => {
      const file = writeRequirements(root, { requirements: [] });
      const r = run(["--requirements", file]);
      assert.equal(r.code, 2);
      assert.match(r.err, /--requirements needs at least one --skill-root/);
    });
  });

  it("a requirements file that cannot be read exits 2", () => {
    withWorkspace((root) => {
      const skills = writeSkillRoot(root, "good-skill");
      const r = run([
        "--requirements",
        join(root, "absent.json"),
        "--skill-root",
        skills,
      ]);
      assert.equal(r.code, 2);
      assert.match(r.err, /cannot read requirements file/);
    });
  });

  it("a requirements file that is not valid JSON exits 2", () => {
    withWorkspace((root) => {
      const skills = writeSkillRoot(root, "good-skill");
      const file = writeRequirements(root, "{not json");
      const r = run(["--requirements", file, "--skill-root", skills]);
      assert.equal(r.code, 2);
      assert.match(r.err, /not valid JSON/);
    });
  });

  it("a declaration without a requirements array exits 2", () => {
    withWorkspace((root) => {
      const skills = writeSkillRoot(root, "good-skill");
      const file = writeRequirements(root, '{"brief": "no requirements key"}');
      const r = run(["--requirements", file, "--skill-root", skills]);
      assert.equal(r.code, 2);
      assert.match(r.err, /"requirements" array/);
    });
  });

  it("an unknown argument exits 2", () => {
    const r = run(["--requirements", "x.json", "--skill-root", "/tmp", "--wat"]);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown argument --wat/);
  });
});
