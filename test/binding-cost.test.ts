/**
 * Project binding must not acquire decision-grade git state.
 *
 * The rule, and why it exists:
 *
 * ```text
 * PROJECT RESOLUTION   which project is this?        cheap, descriptive
 * ADMISSION            may I write here?             expensive, decision-time
 * ```
 *
 * A person naming a project was waiting 1.9 seconds, because the binder took a
 * `PortfolioSnapshot` and that snapshot probes git for every repository in the
 * portfolio. Forty-six `git status` and `git rev-list` calls to learn one
 * directory path. Identity was being purchased with evidence identity did not
 * need.
 *
 * The fix was not a cache. A TTL cache invents freshness, and this repository
 * has already learned why: `unknown != absent`, and a number read thirty
 * seconds ago is a number about thirty seconds ago. So the binder stopped
 * asking the expensive question, and the two questions are now two functions.
 *
 * The test asserts the cause, not a duration. A timing assertion on CI measures
 * the machine that runs it, and this machine is not the machine that matters.
 * What must hold is that naming a project starts no subprocess at all, and that
 * the expensive observation is still available where a decision needs it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectIdentities, bindProject, type ProjectIdentity } from "../src/adapters/project-binding.ts";
import { snapshotPortfolio } from "../src/adapters/frontier.ts";

const BINDER = join(process.cwd(), "src", "adapters", "project-binding.ts");

function identity(over: Partial<ProjectIdentity> = {}): ProjectIdentity {
  return {
    name: "friend-video",
    path: "products/friend-video",
    kind: "repo",
    status: "active",
    nature: "product",
    stack: "TypeScript",
    exists: true,
    ...over,
  };
}

describe("binding names a project without reading git", () => {
  it("no subprocess is started while identifying a project", () => {
    // The assertion is structural. `git` is replaced by a program that fails
    // loudly, so if the binder reaches for it the run breaks instead of quietly
    // getting slower on a machine with a warm cache.
    const original = process.env["PATH"];
    process.env["PATH"] = "/nonexistent-for-this-test";
    try {
      const identities = projectIdentities();
      const binding = bindProject("cuesheet", identities);
      assert.ok(
        binding.kind === "bound" || binding.kind === "unbound" || binding.kind === "no_match",
        "binding answered from the registry alone",
      );
    } finally {
      process.env["PATH"] = original!;
    }
  });

  it("the identities carry no git field, so there is nothing to leak in later", () => {
    const [one] = projectIdentities();
    assert.ok(one, "the registry is readable");
    // `branch`, `dirty`, `ahead`, `hasRemote` are decision-grade facts. If any
    // of them appears on this type, a caller can quietly reintroduce the wait
    // by reading them, and the type would be inviting it.
    for (const forbidden of ["branch", "dirty", "ahead", "hasRemote"]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(one, forbidden),
        false,
        `ProjectIdentity must not carry ${forbidden}`,
      );
    }
  });

  it("the binder's signature no longer accepts a portfolio snapshot", () => {
    // Read off the source rather than inferred from a type error, because the
    // failure this guards against is a caller quietly passing a snapshot again
    // and getting the 1.9 seconds back with no error to notice.
    const source = readFileSync(BINDER, "utf8");
    assert.doesNotMatch(
      source,
      /PortfolioSnapshot/,
      "the binder must not be typed against a git-probed portfolio",
    );
    assert.doesNotMatch(source, /snapshotPortfolio\(\)/, "and must not call the prober itself");
  });

  it("resolution still works, on the real registry", () => {
    const identities = projectIdentities();
    assert.ok(identities.length > 10, `the portfolio has ${identities.length} repos`);
    const binding = bindProject("cuesheet", identities);
    assert.equal(binding.kind, "bound", "the project is named");
    if (binding.kind !== "bound") return;
    assert.equal(binding.candidate.path, "tools/cuesheet");
  });
});

describe("admission still reads the machine, at the moment a decision needs it", () => {
  it("the expensive observation is still there and still reads git", () => {
    // The other half of the rule. Splitting the questions is only correct if
    // the expensive one is still available when a decision depends on it.
    const snapshot = snapshotPortfolio();
    assert.ok(snapshot.projects.length > 10, "the portfolio is probed");
    const repo = snapshot.projects.find((p) => p.entry.path === "tools/cuesheet");
    assert.ok(repo, "cuesheet is in it");
    // These four fields are the decision-grade facts, and they come from git.
    assert.equal(typeof repo!.branch, "string", "branch was read from git");
    assert.equal(typeof repo!.dirty, "number", "dirty was read from git");
    assert.equal(typeof repo!.ahead, "number", "unpushed count was read from git");
    assert.equal(typeof repo!.hasRemote, "boolean", "remote was read from git");
  });

  it("the two questions are separate functions with separate costs", () => {
    // A comment is not a boundary. This is the shape of it: one cheap function
    // that names, one expensive function that observes, and no path from the
    // first to the second.
    const binder = readFileSync(BINDER, "utf8");
    const frontier = readFileSync(join(process.cwd(), "src", "adapters", "frontier.ts"), "utf8");
    assert.match(binder, /export function projectIdentities/, "the cheap path exists and is named");
    assert.match(frontier, /export function snapshotPortfolio/, "the expensive path exists and is named");
    assert.doesNotMatch(binder, /execFileSync/, "and the cheap path spawns nothing");
  });
});

describe("what a person sees is unchanged by the split", () => {
  it("the same words come out for the same question", () => {
    // The refactor was a performance change, so the surface must not have moved.
    const before = bindProject("see my friend's video repo", [
      identity(),
      identity({ name: "video-lab", path: "experiments/video-lab" }),
    ]);
    assert.equal(before.kind, "unbound", "two candidates stay a question");
    if (before.kind !== "unbound") return;
    assert.deepEqual(
      before.candidates.map((c) => c.name).sort(),
      ["friend-video", "video-lab"],
    );
  });

  it("a name that matches nothing is still a question, not a refusal", () => {
    const binding = bindProject("something unregistrable", [identity()]);
    assert.equal(binding.kind, "no_match");
  });
});
