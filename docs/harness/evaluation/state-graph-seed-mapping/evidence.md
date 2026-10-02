# EV-STATE-GRAPH-SEED-MAPPING

2026-10-02. SG02.2, AC-SG02, REQ-SG02. Le mapping d'un diff vers les seeds, la
suppression et la couverture inconnue sont livrés : un chemin sans correspondance
arrive dans `unresolved` avec `complete:false` au lieu de produire un plan vide
qui se présente comme complet.

## L'écart

La composition qui existait produit un plan silencieusement vide et complet.
`nodesForSourcePath` renvoie `[]` pour un fichier inconnu, et `computeImpact`
lit `[]` comme « rien n'est affecté » : `seeds` vide, `unresolved` vide, donc
`complete: true` (`impact.ts:181` avant ce changement). L'appelant n'avait aucun
moyen de distinguer un système intact d'un graphe qui n'a jamais entendu parler du
fichier qui vient de changer. C'est exactement l'impact vide trompeur que
REQ-SG02 interdit, et il a été trouvé par revue adversariale, pas inventé ici.

Trois échappements supplémentaires ont été trouvés en construisant le mapping, et
chacun est couvert par un test nommé :

- Un fichier nommé `constructor`, `toString` ou `valueOf` ne renvoyait pas
  `[]`. `bySourcePath` est un objet ordinaire (`Object.fromEntries`), donc
  `index.bySourcePath['constructor']` vaut `Object`, pas un seau. Le chemin
  non cartographié cessait de paraître non cartographié, ce qui est précisément
  l'échec que la tâche existe pour supprimer.
- Une suppression était structurellement invisible pour tout mapping qui résout
  les chemins en regardant ce qui existe encore. Le fichier supprimé n'a plus rien
  à résoudre, donc le changement qui retire un contrat ou un test disparaissait.
- Un chemin non cartographié dont la chaîne coïncide avec un identifiant de nœud
  était absorbé comme seed déclarée. `schema.ts` admet `notes.md` comme id de
  nœud et un dépôt réel peut contenir un fichier de ce nom : la fermeture
  trouvait le nœud, vidait son propre `unresolved` et déclarait une couverture
  complète d'un fichier que le mapping n'avait jamais atteint.

## La correction

`src/adapters/state-graph/impact.ts` :

- `nodesForSourcePath` (ligne 123) teste la propriété propre avant de lire, et
  refuse toute valeur qui n'est pas un tableau. Une propriété héritée n'est
  jamais une déclaration, donc jamais une seed.
- `mapChanges` (ligne 166) cartographie un `PathChange[]` vers `seeds`,
  `unresolved`, `deletions` et `coverage`. Une suppression et le nom disparu
  d'un renommage sont enregistrés ; un renommage est couvert dès que l'un de ses
  deux noms l'est, parce qu'un fichier renommé est un seul fichier logique.
- `computeChangeImpact` (ligne 216) compose le mapping avec la fermeture et
  **rétrécit** `complete` sans jamais l'élargir :
  `complete: plan.complete && mapping.unresolved.length === 0` (ligne 222).

Ce rétrécissement est la ligne qui porte le refus, et elle est nécessaire pour
le cas de collision décrit plus haut : la fermeture seule se laisse tromper. Les
chemins non cartographiés sont aussi passés à `computeImpact` comme seeds
demandés, pour que le mécanisme d'`unresolved` déjà testé fasse le refus, plutôt
qu'un second chemin plus facile à oublier.

`src/adapters/state-graph/loader.ts` : `readChangeSet` (ligne 99) lit un vrai diff
au moyen du vocabulaire de git (`--name-status -z`, plus les fichiers non
suivis). Les séparateurs sont NUL et non le saut de ligne, pour une raison de
correctitude : git met entre guillemets un chemin contenant un retour à la ligne
ou un octet non ASCII, et un chemin cité ne correspond à aucune déclaration, donc
le vrai changement resterait hors du plan. L'enfant git voit un environnement
assemblé par nommage, jamais celui du développeur. Aucun octet de contenu n'est
lu, et un répertoire qui n'est pas un dépôt est refusé au lieu d'être lu comme un
diff vide.

## Preuves

32 tests PASS, 0 fail sur les quatre fichiers de vérification (24 avant, donc 8
ajoutés) :

```
node --test --test-reporter=spec test/state-graph-impact.test.ts \
  test/state-graph-loader.test.ts test/state-graph-manifest.test.ts \
  test/state-graph-schema.test.ts
```

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, inchangé,
aucun situé dans `state-graph`.

Les trois exigences minimales sont prouvées nommément :

- Diff touchant un chemin non déclaré : `complete:false` et le chemin listé
  dans `unresolved` et `unmappedPaths`. Le test affirme d'abord que l'ancienne
  composition renvoie bien `complete:true` et un impact vide, donc qu'il échoue
  sur la branche défectueuse.
- Suppression représentée : `src/a.ts` supprimé est encore seed et impacte `b`,
  et il apparaît dans `deletions`. Supprimer un fichier déclaré puis le retirer du
  graphe donne `deletions` renseigné, `unresolved` renseigné, `complete:false`.
- Chemin hors sources déclarées : impossible d'obtenir un plan vide complet, y
  compris pour les chemins nommés d'après le prototype, pour un ensemble trop
  grand, et pour un chemin qui traverse ; ces derniers sont refusés outright,
  ce qui est plus fort qu'un marquage incomplet.

Non-vacuité établie par mutation, trois mutants :

1. `complete` ramené à `plan.complete` : 1 échec, le test de collision
   identifiant de nœud.
2. Enregistrement des suppressions retiré : 3 échecs, sur la suppression, le
   renommage et le diff réel bout en bout.
3. La recherche par prototype réintroduite dans `nodesForSourcePath` : 1 échec,
   le test des chemins hors sources déclarées.

Le test de bout en bout utilise un vrai dépôt git temporaire, pas une liste de
changements écrite à la main. Il corrige aussi une attente que j'avais formulée
incorrectement : dans l'arbre de travail le nouveau nom d'un renommage est encore
non suivi, donc git rapporte lui-même une suppression et un ajout, et seule la
plage commitée apparie le renommage. Le test affirme ce que git dit réellement.

`src/adapters/state-graph/manifest.ts` n'a pas été touché : le contrôle de
containment sur chemin réel résolu reste en place et ses 7 tests restent verts.

Le manifeste versionné n'a pas été régénéré : `graph:regen` n'a pas été lancé et
`.cuesheet-project/graph.json` est inchangé. Le générateur ne déclare aucun de ces
fichiers, donc aucun digest n'aurait changé de toute façon.

## Limites

`mapChanges` borne le jeu de changements à `DEFAULT_MAX_CHANGES`, une valeur
nouvelle et distincte de `DEFAULT_MAX_IMPACTED`. Elle refuse au-delà, elle ne
tronque pas.

Un diff lu avec une base arbitraire est aussi bien traité qu'un diff contre
`HEAD` : `readChangeSet` prend la base en paramètre et ne l'interprète pas. Rien
dans cette tâche ne décide quelle base un produit doit choisir, c'est une décision
de politique pour l'appelant.

La suite complète à sept workers n'a pas été exécutée ici, seule la vérification
ciblée demandée l'a été, plus `loadability`, `portability` et le test de manifeste
comme voisins immédiats. `docs/harness/state.json` n'a pas été édité : SG02.2 y
reste TODO jusqu'à ce que l'orchestrateur intègre. AC-SG02 reste PENDING, elle
dépend encore de SG02.3.

SG02.2 porté à READY_FOR_MANUAL_ACCEPTANCE du point de vue de l'agent. L'état
`DONE` vient après l'acceptation humaine.