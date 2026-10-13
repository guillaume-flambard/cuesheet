import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterPaletteCommands} from '../apps/terminal/src/overlays/palette-search.ts';

test('French palette labels keep English search aliases for existing workflows',()=>{
 const names=filterPaletteCommands('').map(c=>c.label);
 assert.ok(names.includes('Voir le journal'));
 assert.ok(names.includes('Aide'));
 assert.ok(names.includes('Fournisseur et modèle'));
 assert.ok(names.includes('Espaces de travail'));
 assert.equal(filterPaletteCommands('help')[0]?.overlay,'help');
 assert.equal(filterPaletteCommands('modèle')[0]?.overlay,'models');
 assert.equal(filterPaletteCommands('provider')[0]?.overlay,'models');
 assert.equal(filterPaletteCommands('workspaces')[0]?.overlay,'workspaces');
});
