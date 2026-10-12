import { it } from "node:test";
import assert from "node:assert/strict";

import { filterPaletteCommands, paletteCommands } from "../apps/terminal/src/overlays/palette-search.ts";

it("returns all commands in stable order for an empty search", () => {
  assert.deepEqual(filterPaletteCommands(""), paletteCommands);
});

it("finds commands with accents, case-insensitive words or overlay names", () => {
  assert.deepEqual(filterPaletteCommands("MODELE").map(c => c.overlay),
    ["models", "agent-models"]);
  assert.deepEqual(filterPaletteCommands("agent model").map(c => c.overlay), ["agent-models"]);
  assert.deepEqual(filterPaletteCommands("  Nouvelle  SESSION  ").map(c => c.overlay), ["new"]);
  assert.deepEqual(filterPaletteCommands("résumés"), []);
});

it("a query that matches nothing must not fall back to a different command", () => {
  assert.equal(filterPaletteCommands("not-existing-command").length, 0);
});
