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

  it("a greeting is a shape, not a list of words", () => {
    // The list failed on "hey there", the shape failed on "bonjour la", then on
    // "salut toi", then on "bonjour tout le monde", then on "hey how are you".
    // Widening a list is the wrong instrument for an open set. These are the
    // cases that broke each earlier attempt, pinned so a fourth does not start.
    for (const line of [
      "hey there", "hi there", "thanks", "thank you", "bonjour la",
      "salut toi", "bonjour tout le monde", "hey how are you",
      "salut comment ça va", "ca va", "ca va ?", "d'accord", "ok",
      "merci beaucoup", "ouais", "yo",
    ]) {
      assert.equal(routeIntention(line).kind, "conversational", line);
    }
  });

  it("approval is its own intent, and it is decided first", () => {
    // Every way of saying yes resolves to the same act. This used to be a
    // four-word list in chat.ts, so "ok go", "ok vas-y", "lance" and "fais-le"
    // all discarded the goal the person was approving.
    for (const line of [
      "go", "ok go", "ok vas-y", "lance", "fais-le", "allez", "vas-y",
      "lets go", "do it", "c'est parti", "allez-y", "bah vas-y",
    ]) {
      assert.equal(routeIntention(line).kind, "confirm", line);
    }
  });

  it("refusal is its own intent too", () => {
    for (const line of ["non", "stop", "arrête", "annule", "laisse tomber", "nope"]) {
      assert.equal(routeIntention(line).kind, "cancel", line);
    }
  });

  it("a greeting word with nothing after it stays a greeting", () => {
    // "ok" alone is approval only when something is staged. The router does not
    // know what is staged, so it routes the word by its shape and the surface
    // decides. This is the decoupling, and it is why "ok" is not "confirm".
    assert.equal(routeIntention("ok").kind, "conversational");
    assert.equal(routeIntention("ok vas-y").kind, "confirm");
  });

  it("a greeting never swallows a work order, however it opens", () => {
    // The property the greeting pattern exists to protect. "test" is in the
    // social set, so "test the parser" must not be read as a greeting, and a
    // greeting followed by a verb must stay work.
    for (const line of [
      "hey fix the failing test",
      "ok go write the plan",
      "ca va le fichier est cassé",
      "test the parser",
      "runs the suite",
      "ecris le plan",
    ]) {
      assert.equal(routeIntention(line).kind, "goal", line);
    }
  });

  it("asking what to work on is a recommendation, not an inventory", () => {
    // These used to reach the inventory, which answered "free to write: 17".
    // A count describes the portfolio; the question asks for a choice. The two
    // are now different intents, and `projects` still gives the counts.
    for (const line of [
      "on what can we work today ?",
      "sur quoi on peut travailler ?",
      "quoi faire ?",
      "what should we build next",
      "on bosse sur quoi",
      "et maintenant ?",
      "next up",
      "par quoi commencer",
      "que faire maintenant",
      "what can we do",
      "next",
    ]) {
      assert.equal(routeIntention(line).kind, "next", line);
    }
  });

  it("the inventory is still reachable, and is still not the recommendation", () => {
    for (const line of ["projects", "held", "qui peut écrire"]) {
      assert.equal(routeIntention(line).kind, "ownership", line);
    }
  });

  it("a complaint containing a topic word is still not a question", () => {
    // "quoi" is a topic word, not a question shape. Without this, "c'est quoi
    // cette merde" was answered with the portfolio view.
    for (const line of [
      "c'est quoi cette merde",
      "c'est quoi cette merde serieux",
      "ca marche pas",
    ]) {
      assert.equal(routeIntention(line).kind, "goal", line);
    }
  });

  it("a work order keeps the topic words and stays a goal", () => {
    for (const line of ["add a projects page", "fix the test", "sur quoi on a travaille ce matin ?"]) {
      const kind = routeIntention(line).kind;
      assert.ok(kind === "goal" || line.endsWith("?"), `${line} routed to ${kind}`);
    }
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
