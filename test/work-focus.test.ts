import { it } from "node:test";
import assert from "node:assert/strict";

import { projectWorkFocus } from "../apps/terminal/src/components/work-focus.ts";
import type { Entry } from "../apps/terminal/src/app/state.ts";

const user = (id: string, text: string): Entry => ({ id, kind: "you", text });

it("introduces a new session without fabricating an objective or progress", () => {
  const focus = projectWorkFocus([], false);
  assert.equal(focus.request, null);
  assert.match(focus.heading, /Bienvenue/);
  assert.doesNotMatch(focus.detail, /vérifié|terminé|réussi/);
});

it("shows the latest human request rather than guessing the durable goal", () => {
  const focus = projectWorkFocus([
    { id: "s:scope", kind: "status", label: "working in", value: "/tmp/work", certainty: "confirmed" },
    user("s:1", "Créer un document"),
    { id: "s:run", kind: "status", label: "work", value: "Action demandée", certainty: "active" },
    user("s:2", "Change l'ordre des tests"),
  ], true);
  assert.equal(focus.request, "Change l'ordre des tests");
  assert.match(focus.heading, /Dernière demande/);
  assert.match(focus.detail, /attente/);
  assert.doesNotMatch(focus.detail, /Action demandée/);
});

it("unknown effects and unverified changes are not presented as proof", () => {
  const effects: Entry[] = [
    user("u", "Modifier la configuration"),
    { id: "r", kind: "action", label: "edit", detail: "config.ts", certainty: "active" },
  ];
  assert.match(projectWorkFocus(effects, true).detail, /demandée/i);
  effects[1] = { ...effects[1], certainty: "unknown" };
  assert.match(projectWorkFocus(effects, false).detail, /vérifier/i);
  effects[1] = { ...effects[1], certainty: "confirmed" };
  const done = projectWorkFocus(effects, false);
  assert.match(done.detail, /observée/i);
  assert.doesNotMatch(done.detail, /vérifié|validé|terminé/i);
});

it("the newest meaningful signal is never replaced by older failure or ambient scope", () => {
  const focus = projectWorkFocus([
    user("u", "Faire une correction"),
    { id: "f", kind: "failure", text: "Ancienne panne" },
    { id: "a", kind: "action", label: "read", detail: "package.json", certainty: "confirmed" },
    { id: "s", kind: "status", label: "modèle", value: "provider/x", certainty: "confirmed" },
  ], false);
  assert.match(focus.detail, /package.json/);
  assert.doesNotMatch(focus.detail, /Ancienne panne|provider\/x/);
});

it("preserves explicit failure and unknown reason without declaring it fixed", () => {
  const focus = projectWorkFocus([
    user("u", "Continuer"),
    { id: "e", kind: "failure", text: "Aucune autorisation pour écrire" },
  ], false);
  assert.match(focus.detail, /Aucune autorisation/);
  assert.equal(focus.tone, "failed");
  const uncertain = projectWorkFocus([
    user("u", "Continuer"),
    { id: "s", kind: "status", label: "résultat", value: "inconnu", certainty: "unknown" },
  ], false);
  assert.match(uncertain.detail, /inconnu/);
  assert.equal(uncertain.tone, "unknown");
});
