/**
 * The founding case, typed exactly as it was typed.
 *
 * ```text
 * cwd = /Users/memo
 * > see my friend's video repo
 * ```
 *
 * The surface answered "not a goal" and "nothing here can run a goal". The first
 * was false and the second was true, and the surface said them as one fact. This
 * file pins the difference, because a fix that is not pinned here will be undone
 * by the next person who reads `not a goal` as a reasonable answer to a line that
 * does not look like work.
 *
 * The words in the first case are load-bearing. "see my friend's video repo"
 * contains no verb from the work list, so the old heuristic fell straight through
 * to the non-goal branch. Any test using "fix the parser" would have passed
 * before the fix and told us nothing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bindProject,
  mayApprove,
  describeBinding,
  tokensOf,
  type Binding,
  type BindingCandidate,
} from "../src/adapters/project-binding.ts";
import type { ProjectIdentity } from "../src/adapters/project-binding.ts";

/**
 * A project identity, which is all binding is given.
 *
 * These tests used to build a git-probed portfolio here, because the binder
 * demanded one. They no longer do, and the absence of `branch`, `dirty` and
 * `ahead` from this helper is the point: binding is not allowed to see them.
 */
function repo(name: string, path: string, extra: Partial<ProjectIdentity> = {}): ProjectIdentity {
  return {
    name,
    path,
    kind: "repo",
    status: "active",
    nature: "product",
    stack: "",
    exists: true,
    ...extra,
  };
}

/** The binder takes identities now, so a "snapshot" here is just a list. */
function snap(...projects: ProjectIdentity[]): ProjectIdentity[] {
  return projects;
}

const FRIEND_VIDEO = repo("friend-video", "products/friend-video");

describe("BIND-02 the absence of a project can never turn a goal into a non-goal", () => {
  it("the founding line is an intention, not a non-goal", () => {
    // The line as typed, verbatim. The "not a goal" answer is what this rules out.
    const said = "see my friend's video repo";
    const binding = bindProject(said, snap(FRIEND_VIDEO));

    // The intention is intact and named, in both outcomes.
    const described = describeBinding(said, binding);
    assert.match(described[0]!, /^goal {5}see my friend's video repo$/);
    assert.doesNotMatch(described.join("\n"), /not a goal/);
    assert.doesNotMatch(described.join("\n"), /nothing here can run a goal/);
  });

  it("an unknown project yields an intent, and the goal is never dropped", () => {
    const said = "see my friend's video repo";
    const binding = bindProject(said, snap(repo("unrelated", "products/unrelated")));
    assert.equal(binding.kind, "no_match");
    // The goal survives the failure to bind. That is BIND-03 in one assertion:
    // the caller still holds a stated intention, durably, and can ask about it.
    assert.match(describeBinding(said, binding)[0]!, /goal {5}see my friend's video repo/);
  });

  it("the old work-verb heuristic would not have caught this line, which is why it failed", () => {
    // The regex that produced "not a goal" for the founding line.
    const looksLikeWork = /\b(fix|add|write|build|create|make|update|remove|refactor|test|debug|implement|ship|commit)\b/i;
    assert.equal(
      looksLikeWork.test("see my friend's video repo"),
      false,
      "the founding line carries no work verb, so the heuristic had nothing to hold onto",
    );
  });
});

describe("BIND-01 a stated intention binds when exactly one project defends itself", () => {
  it("one match is a binding, and the path is absolute so nothing guesses it", () => {
    const binding = bindProject("see my friend's video repo", snap(FRIEND_VIDEO));
    assert.equal(binding.kind, "bound");
    if (binding.kind !== "bound") return;
    assert.equal(binding.candidate.name, "friend-video");
    assert.equal(binding.candidate.path, "products/friend-video");
    assert.equal(binding.candidate.exists, true);
  });

  it("a project named only in the registry is offered, and marked as not on disk", () => {
    const missing = repo("ghost-repo", "products/ghost-repo", { exists: false });
    const binding = bindProject("work on ghost repo", snap(missing));
    assert.equal(binding.kind, "unbound", "nothing to work in, so it is not a bound answer");
    if (binding.kind !== "unbound") return;
    assert.match(describeBinding("work on ghost repo", binding).join("\n"), /declared, not on disk/);
  });
});

describe("BIND-05 resolution never invents a match when more than one defends itself", () => {
  it("two plausible projects are a question, not a silent pick", () => {
    const binding = bindProject(
      "see my friend's video repo",
      snap(FRIEND_VIDEO, repo("video-lab", "experiments/video-lab")),
    );
    assert.equal(binding.kind, "unbound", "two candidates must not collapse into one");
    if (binding.kind !== "unbound") return;
    const names = binding.candidates.map((c) => c.name).sort();
    assert.deepEqual(names, ["friend-video", "video-lab"]);

    const asked = describeBinding("see my friend's video repo", binding).join("\n");
    assert.match(asked, /project {2}unresolved/);
    assert.match(asked, /project\? see my friend's video repo>/, "and the prompt asks, keeping the goal visible");
  });

  it("a project that does not match at all is not offered as a candidate", () => {
    const binding = bindProject("see my friend's video repo", snap(repo("billing-api", "tools/billing-api")));
    assert.equal(binding.kind, "no_match");
    if (binding.kind !== "no_match") return;
    assert.equal(binding.candidates.length, 0, "no_match does not pad the list");
  });
});

describe("BIND-04 APPROVE_GOAL is absent until the project is resolved", () => {
  it("approvable only on a bound goal", () => {
    assert.equal(mayApprove({ kind: "bound", candidate: FRIEND_VIDEO }), true);
    assert.equal(mayApprove({ kind: "unbound", candidates: [FRIEND_VIDEO] }), false);
    assert.equal(mayApprove({ kind: "no_match", candidates: [] }), false);
  });

  it("an unresolved goal is asked about, never offered as runnable", () => {
    const ambiguous = bindProject(
      "see my friend's video repo",
      snap(FRIEND_VIDEO, repo("video-lab", "experiments/video-lab")),
    );
    // No "go?" while unresolved: the prompt is a question, and a question is not
    // an affordance. This is the safety half of the rule.
    const asked = describeBinding("see my friend's video repo", ambiguous).join("\n");
    assert.doesNotMatch(asked, /^go\?/m);

    const bound = bindProject("see my friend's video repo", snap(FRIEND_VIDEO));
    assert.match(describeBinding("see my friend's video repo", bound).join("\n"), /^go\?/m);
  });
});

describe("BIND-06 the same goal continues, and the tokens say why a project matched", () => {
  it("the token filter drops the words that carry no project identity", () => {
    // "friend", "repo", "see" and "my" are noise; "video" is the signal.
    const tokens = tokensOf("see my friend's video repo");
    assert.ok(tokens.includes("video"));
    for (const noise of ["see", "my", "friend", "repo", "the", "a"]) {
      assert.ok(!tokens.includes(noise), `${noise} should not be an identity token`);
    }
  });

  it("the basis is reported so a person can check the match rather than trust it", () => {
    const byName = bindProject("video", snap(FRIEND_VIDEO));
    assert.equal(byName.kind, "bound");
    if (byName.kind === "bound") assert.equal(byName.candidate.basis, "name-token");

    const byPath = bindProject("fix the experiments video-lab thing", snap(repo("misc", "experiments/video-lab")));
    assert.equal(byPath.kind, "bound");
    if (byPath.kind === "bound") {
      assert.ok(
        ["name-token", "description-token"].includes(byPath.candidate.basis),
        `unexpected basis ${byPath.candidate.basis}`,
      );
    }
  });

  it("the text is never mutated, so the goal that continues is the goal that was stated", () => {
    const said = "  see my friend's video repo  ";
    const binding: Binding = bindProject(said, snap(FRIEND_VIDEO));
    assert.equal(describeBinding(said, binding)[0], `goal     ${said}`, "verbatim, whitespace and all");
  });
});

describe('explicit canonical names distinguish the real validation repository from its pilots',()=>{
 const projects=snap(repo('intentlane','products/intentlane'),repo('intentlane-vault','experiments/intentlane-vault'),repo('intentlane-iina','experiments/intentlane-iina'),repo('videoai','experiments/videoai',{nature:'pilot'}));
 it('binds a naturally stated task to IntentLane without asking which pilot',()=>{const binding=bindProject('In IntentLane, ignore generated pilot .build directories.',projects);assert.equal(binding.kind,'bound');if(binding.kind==='bound')assert.equal(binding.candidate.name,'intentlane');});
 it('names a hyphenated pilot without selecting its parent',()=>{const binding=bindProject('Fix intentlane-vault source paths',projects);assert.equal(binding.kind,'bound');if(binding.kind==='bound')assert.equal(binding.candidate.name,'intentlane-vault');});
 it('keeps two explicit names ambiguous',()=>assert.equal(bindProject('Compare IntentLane and intentlane-vault',projects).kind,'unbound'));
 it('does not fall through a missing explicit project to a sibling',()=>{const binding=bindProject('Fix IntentLane pilot paths',projects.map(p=>p.name==='intentlane'?{...p,exists:false}:p));assert.equal(binding.kind,'unbound');if(binding.kind==='unbound')assert.deepEqual(binding.candidates.map(c=>c.name),['intentlane']);});
});
