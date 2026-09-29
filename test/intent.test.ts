import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { routeIntention } from "../src/core/intent.ts";

describe("routeIntention", () => {
  it("empty and whitespace lines route to empty, in both modes", () => {
    assert.equal(routeIntention("").kind, "empty");
    assert.equal(routeIntention("   ").kind, "empty");
    assert.equal(routeIntention("!").kind, "empty", "a lone override marks nothing");
  });

  it("exit in both languages, with and without the override", () => {
    for (const line of ["exit", "quit", "q", "sortie", "quitte", "!exit", "!quitte"]) {
      assert.equal(routeIntention(line).kind, "exit", line);
    }
  });

  it("help routes, and so does its French twin", () => {
    assert.equal(routeIntention("help").kind, "help");
    assert.equal(routeIntention("aide").kind, "help");
  });

  it("state queries route in both languages", () => {
    for (const line of [
      "capabilities",
      "skills",
      "capacités",
      "sessions",
      "historique",
      "projects",
      "projets",
      "ownership",
      "disponible",
      "held",
      "qui peut écrire",
    ]) {
      const i = routeIntention(line);
      assert.notEqual(i.kind, "goal", `a state query fell through to goal: ${line}`);
    }
  });

  it("an ownership question with trailing words still routes", () => {
    assert.equal(routeIntention("who can write right now").kind, "ownership");
  });

  it("inspect and resume extract the session id, in both languages", () => {
    assert.equal(routeIntention("inspect ses_abc123").kind, "inspect");
    assert.equal(routeIntention("inspect ses_abc123").id, "ses_abc123");
    assert.equal(routeIntention("inspecte ses_abc123").id, "ses_abc123");
    assert.equal(routeIntention("resume ses_x").id, "ses_x");
    assert.equal(routeIntention("reprends ses_x").id, "ses_x");
  });

  it("admission checks the text without running it", () => {
    const i = routeIntention("gate: load the `tdd` skill and fix the test");
    assert.equal(i.kind, "admission");
    assert.match(i.text, /load the `tdd` skill/);
  });

  it("everything else is a goal, which is the default that matters", () => {
    for (const line of [
      "fix the failing test in intentlane",
      "prove Notes append support",
      "résume le contrat en trois points",
    ]) {
      assert.equal(routeIntention(line).kind, "goal", line);
    }
  });

  it("an override keeps the intent but marks it forced", () => {
    const i = routeIntention("!fix the failing test");
    assert.equal(i.kind, "goal");
    assert.equal(i.forced, true);
    assert.equal(i.text, "fix the failing test", "the bang is consumed, the work is not");
  });

  it("an override on a query does not change the query", () => {
    const i = routeIntention("!sessions");
    assert.equal(i.kind, "sessions");
    assert.equal(i.forced, true);
  });

  it("the routing is deterministic: same line, same intent", () => {
    const a = routeIntention("prove Notes append");
    const b = routeIntention("prove Notes append");
    assert.deepEqual(a, b);
  });
});
