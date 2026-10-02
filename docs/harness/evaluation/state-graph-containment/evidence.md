# EV-STATE-GRAPH-CONTAINMENT

2026-10-02. SG01.3b, AC-SG01-containment, REQ-SG01. La containment des sources
déclarées est décidée sur le chemin réel résolu, et un lien symbolique qui sort
de la racine owner est refusé avant toute lecture d'octet.

## L'écart

Le générateur hachait chaque source déclarée via `ownerFile`, qui ne comparait
que la chaîne : `resolve(root, path)` puis `relative(root, absolute)`. Un chemin
lexical reste sous la racine même quand il traverse un lien symbolique, donc un
lien placé sous la racine owner et pointant dehors passait le contrôle, puis
`readFileSync` le suivait et hachait des octets vivant hors de l'arbre owner.
Revue adversariale, jamais exploité. Les cinq tests préexistants du fichier
restaient verts sur cette branche cassée, ce qui est vérifié ci-dessous.

## La correction

`src/adapters/state-graph/manifest.ts:145`, dans `ownerFile` :

```ts
const real=realpathSync(absolute),resolved=relative(realpathSync(root),real);
if(!resolved||resolved.startsWith('..')||isAbsolute(resolved))throw new Error(`Manifest declaration escapes the owner root: ${path}`);
```

Les deux côtés de la comparaison sont résolus, `root` aussi bien que la déclaration,
sinon la racine elle-même, qui peut contenir un lien, fausserait le `relative`.
Le refus réutilise le même message que le contrôle lexical, qui reste en place
pour les deux autres branches : chemin relatif sortant et chemin absolu déclaré.
`ownerFile` retourne maintenant `real`, donc le fichier lu est exactement celui
qui a passé le contrôle, et le refus intervient avant le `readFileSync` de
`digestOf`, puisque la seule voie vers la lecture passe par `ownerFile`.

`ownerFile` est exporté : c'est la défense de traversal du générateur, et elle
était jusqu'ici non testable depuis l'extérieur, comme le notait déjà
`evaluation/state-graph-manifest/evidence.md`.

## Preuves

7 tests PASS, 0 fail dans `test/state-graph-manifest.test.ts` ; 4 PASS, 0 fail
dans `test/state-graph-schema.test.ts`. Deux tests sont ajoutés :

- Refus avant lecture : dans un répertoire temporaire, un lien relatif sortant
  est refusé avec le message de containment, de même qu'un lien vers un
  répertoire dehors, où une lecture aurait produit `EISDIR` et non ce message,
  ce qui prouve que le contrôle précède la lecture. Les deux refus lexiques
  partagent le même message. Un lien relatif intérieur est admis, retourne bien
  `realpathSync` de sa cible et ses octets sont lisibles.
- Bout en bout : le générateur reçoit une racine temporaire où tous les
  chemins déclarés existent, sauf un transformé en lien sortant. Le seul échec
  possible est le refus de containment ; sans lui le build réussit et hache les
  octets du dehors. Le même fixture, avec le lien ramené à l'intérieur, produit
  un graphe valide dont le digest de ce chemin est le SHA256 réel de la cible.

Non-vacuité établie par mutation : avec `ownerFile` ramené à l'ancien contrôle
de chaîne, exactement les 2 nouveaux tests échouent et les 5 préexistants
restent verts, 5 pass et 2 fail. Le fichier `test/state-graph-manifest.test.ts`
compte donc 7 tests.

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, inchangé,
tous hérités et situés hors `state-graph`.

Le manifeste versionné n'a pas été régénéré : `graph:regen` n'a pas été lancé et
`.cuesheet-project/graph.json` est inchangé, ce que le premier test prouve par
égalité octet à octet avec une reconstruction fraîche. La correction ne touche
que le refus, pas les digests d'un fichier régulier.

## Limites

Une course résiduelle subsiste entre `realpathSync` et `readFileSync` : un
élément de chemin pourrait être remplacé pendant l'intervalle. Elle appartient à
la même classe que le reste du générateur, qui lit des fichiers de travail en
liture seule, et le loader a déjà sa propre défense `O_NOFOLLOW` pour le
manifeste lui-même. Elle n'est pas revendiquée comme fermée.

La suite complète à sept workers n'a pas été exécutée ici, seule la vérification
ciblée demandée l'a été. `docs/harness/state.json` n'a pas été édité : SG01.3b y
reste TODO jusqu'à ce que l'orchestrateur intègre, et l'évidence attendue dans
`evaluation/state-graph-containment/` est ce fichier.

SG01.3b porté à READY_FOR_MANUAL_ACCEPTANCE du point de vue de l'agent. L'état
`DONE` vient après l'acceptation humaine.
