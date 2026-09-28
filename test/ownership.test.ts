import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  resolveOwnership,
  availableProjects,
  type Project,
  type ProjectState,
  type ActiveSession,
} from "../src/core/ownership.ts";

const NOW = 1_757_000_000_000;
const MIN = 60_000;

const project = (id: string, path: string): Project => ({ id, path });
const clean: ProjectState = { dirtyFiles: 0, commitsAhead: 0, hasUpstream: true };
const states = (...entries: [string, ProjectState][]) => new Map(entries);

describe("resolveOwnership", () => {
  test("a project with no session and a clean tree is available", () => {
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [],
      states(["p", clean]),
      { now: NOW },
    );
    assert.equal(result.availability, "available");
    assert.equal(result.lastSession, null);
    assert.deepEqual(result.reasons, []);
  });

  test("a recent session holds the project", () => {
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [{ id: "s1", directory: "/w/p", lastActivity: NOW - 2 * MIN }],
      states(["p", clean]),
      { now: NOW },
    );
    assert.equal(result.availability, "held");
    assert.equal(result.lastSession?.id, "s1");
    assert.match(result.reasons[0], /session active 2 min ago/);
  });

  test("a session outside the window does not hold, but is not discarded either", () => {
    // The distinction that matters: an old session is not a live owner, yet it
    // is still evidence that this project was worked on.
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [{ id: "s1", directory: "/w/p", lastActivity: NOW - 60 * MIN }],
      states(["p", clean]),
      { now: NOW },
    );
    assert.equal(result.availability, "available");
    assert.equal(result.lastSession, null);
  });

  test("an uncommitted tree holds the project even with no session", () => {
    // The case that was almost cleaned up as abandoned work.
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [],
      states(["p", { dirtyFiles: 39, commitsAhead: 0, hasUpstream: false }]),
      { now: NOW },
    );
    assert.equal(result.availability, "held");
    assert.match(result.reasons.join(" "), /39 uncommitted/);
  });

  test("unpushed commits hold the project and raise needsPush", () => {
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [],
      states(["p", { dirtyFiles: 0, commitsAhead: 2, hasUpstream: true }]),
      { now: NOW },
    );
    assert.equal(result.availability, "held");
    assert.equal(result.needsPush, true);
  });

  test("a project with no upstream is not an error", () => {
    // Reproduced from a real repo after a registry move: `git log @{u}..HEAD`
    // exits 128, and under set -e that silently truncated a report.
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [],
      states(["p", { dirtyFiles: 3, commitsAhead: 0, hasUpstream: false }]),
      { now: NOW },
    );
    assert.equal(result.availability, "held");
    assert.equal(result.needsPush, false);
  });

  test("only the most recent session is reported per project", () => {
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [
        { id: "old", directory: "/w/p", lastActivity: NOW - 10 * MIN },
        { id: "new", directory: "/w/p", lastActivity: NOW - 1 * MIN },
      ],
      states(["p", clean]),
      { now: NOW },
    );
    assert.equal(result.lastSession?.id, "new");
  });

  test("a session in one project does not hold a sibling project", () => {
    // Cross-contamination is the bug this primitive exists to prevent.
    const result = resolveOwnership(
      [project("a", "/w/a"), project("b", "/w/b")],
      [{ id: "s1", directory: "/w/a", lastActivity: NOW - 1 * MIN }],
      states(["a", clean], ["b", clean]),
      { now: NOW },
    );
    assert.equal(result[0]?.availability, "held");
    assert.equal(result[1]?.availability, "available");
    assert.deepEqual(availableProjects(result).map((o) => o.project.id), ["b"]);
  });

  test("a project with no reported state is treated as clean, not as broken", () => {
    const [result] = resolveOwnership([project("p", "/w/p")], [], new Map(), { now: NOW });
    assert.equal(result.availability, "available");
  });

  test("reasons always explain the verdict", () => {
    const result = resolveOwnership(
      [project("p", "/w/p")],
      [{ id: "s1", directory: "/w/p", lastActivity: NOW - 1 * MIN }],
      states(["p", { dirtyFiles: 1, commitsAhead: 1, hasUpstream: true }]),
      { now: NOW },
    );
    assert.equal(result[0]?.reasons.length, 3);
  });

  test("the window is configurable", () => {
    const [result] = resolveOwnership(
      [project("p", "/w/p")],
      [{ id: "s1", directory: "/w/p", lastActivity: NOW - 30 * MIN }],
      states(["p", clean]),
      { now: NOW, windowMs: 5 * MIN },
    );
    assert.equal(result.availability, "available");
  });
});
