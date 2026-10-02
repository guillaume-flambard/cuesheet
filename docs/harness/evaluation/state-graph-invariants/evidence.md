# EV-STATE-GRAPH-INVARIANTS

2026-10-02. SG03.1, REQ-SG03, AC-SG03. Registre déclaratif des invariants du
domaine, chaque entrée liée au check owner qui l'applique, avec un statut
d'enforcement calculé plutôt qu'assumé.

## L'écart

Le manifeste `.cuesheet-project/graph.json` déclarait déjà 16 nodes de kind
`invariant`, chacun avec `ownerRef`, `sourceRefs` et `checkRefs`. Aucun code ne
résolvait cette déclaration. Rien ne distinguait un invariant dont le check
existe de celui dont le `checkRef` pointe vers un test absent, renommé, ou détenu
par un autre propriétaire. Une déclaration non résolue était donc
indiscernable d'une déclaration vérifiée : la présence du `checkRef` jouait le
rôle de la preuve. C'est l'inverse du but de REQ-SG03, où un résultat inconnu ne
vaut pas succès.

## La forme choisie

Données déclaratives, pas un moteur. `InvariantDeclaration` porte un `id` stable,
`statement`, `domainId`, `ownerRef`, `sources` et `checks`. `defineInvariants`
valide puis gèle, et refuse identifiant non stable, statement vide ou trop
longue, sources non relatives ou ambiguës, doublons, plus de 8 checks.
`ownerCheckCatalog(graph)` extrait les seuls nodes `test` et `ci`, par id et par
owner. `evaluateInvariants(registry, catalog)` résout chaque entrée et rend
`status` (`enforced` ou `unenforced`), `reason` (`check-present`,
`check-not-declared`, `check-unknown`, `check-not-owner`), `unresolved` et
`checkExists`. `complete` exige un registre non vide et zéro écart, donc un
registre vide n'est jamais complet. `unregisteredInvariants` donne l'écart
inverse : un invariant que le graphe énonce et que le registre ne porte pas.

Trois choix qui méritent d'être nommés. `checks` vide est une déclaration
légale, parce que c'est exactement l'écart que le registre doit faire
apparaître. `checkExists` est vrai seulement si la liste est non vide et que
tous ses checks résolvent : une liste à moitié résolue n'applique rien. Et
`enforced` ne signifie qu'une chose ici, un check déclaré qui existe dans le
catalogue et appartient au même owner. Aucun verdict, aucune staleness : ce sont
les règles du runner de SG03.2, et les anticiper ici aurait volé son périmètre.

Le registre livré reprend les 16 nodes `invariant` du manifeste, avec les mêmes
sources et les mêmes `checkRefs`, tous sous `ownerRef` `owner.cuesheet`.

## Preuves

9 tests PASS, 0 fail dans `test/state-graph-invariants.test.ts`.

Le test central porte le gap exigé : un invariant déclaré avec `checks: []`
revient `unenforced`, `reason` `check-not-declared`, `checkExists` false,
`complete` false, et il reste une ligne de `entries` plutôt qu'une ligne
absente. Le même résultat est exigé deux fois, avec un catalogue vide puis avec
le catalogue complet, parce qu'un silence qui dépend du catalogue est
précisément l'hypothèse à supprimer. Un check inconnu donne `check-unknown`, un
check détenu par un autre owner donne `check-not-owner`, et dans les deux cas le
rapport nomme le check qui n'a pas résolu.

Le registre livré est vérifié contre l'artefact commité, en lecture seule :
`parseStateGraph` sur `.cuesheet-project/graph.json`, puis pour chaque entrée le
node existe et est de kind `invariant`, même `domainId`, même `ownerRef`, mêmes
`checkRefs`, mêmes `sourceRefs`, chaque check est un node `test` ou `ci` qui
nomme l'entrée en retour par `invariantRefs`, et chaque source citée est un
fichier présent. L'écart inverse est exigé vide sur ces données réelles, pas
seulement sur des graphes de fixture.

Non-vacuité établie par mutation. Le fichier source est restauré à l'identique
après chaque mutation, sha256
`ed50105c9017735cf3f12de3e6b0a587e0a9b541154178dc005c2ec16e2d417a`.

| Mutation | Résultat |
| --- | --- |
| liste `checks` vide plus nommée | 8 pass, 3 fail |
| une liaison vide compte comme appliquée | 8 pass, 3 fail |
| tout check du catalogue applique | 8 pass, 3 fail |
| un écart ne rend plus le registre incomplet | 7 pass, 5 fail |
| le catalogue admet les nodes qui ne sont pas des checks | 8 pass, 3 fail |
| un id livré dérive du manifeste | 8 pass, 3 fail |
| une source livrée dérive du manifeste | 8 pass, 3 fail |

Les deux dernières échouent sur l'assertion qui les vise : `the manifest states
an invariant the registry does not carry` et
`invariant.sessions.durable cites sources the manifest does not declare`.

Fichiers voisins touchés par l'ajout, vérifiés séparément :
`test/loadability.test.ts` 6 PASS, 0 fail, il importe récursivement chaque module
de `src` et le nouveau module se charge ; `test/portability.test.ts` 20 PASS,
0 fail, dont PORT-05 qui parcourt `test/` et `src/`.

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, et aucun
ne nomme `invariants.ts`. Cette commande ne typechecke que `src/**/*.ts`, le
fichier de test n'entre donc pas dans ce compte.

## Limites assumées

Le fichier de test du registre n'est pas lui-même un node `check` du manifeste.
L'artefact se régénère par `graph:regen`, hors périmètre de ce lot, donc aucune
écriture de `.cuesheet-project/graph.json` n'a eu lieu et le registre n'est pas
auto-certifié par le manifeste : il est vérifié contre lui, ce qui laisse la
dernière étape à l'intégration.

AC-SG03 a deux moitiés runtime, un résultat compilation PASS avec invariant FAIL
qui laisse le domaine non validé, et un changement dépendant qui invalide les
preuves sourcées. Elles appartiennent à SG03.2 et SG03.3. SG03.1 livre l'entrée
du runner, pas le verdict.