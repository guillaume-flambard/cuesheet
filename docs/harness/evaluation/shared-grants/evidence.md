# EV-SHARED-GRANTS

2026-10-02. E01.6, REQ-E01.6, AC-E01.6. Les grants sont une autorité distincte du
journal : `SharedMemoryStore` et `SharedContexts` restent des sources et n'accordent
rien. `SharedRetrieval` est la seule porte d'un principal, et chaque search et
chaque read demandent le registre avant IO puis revérifient après projection.

## La forme

Trois ajouts dans `src/adapters/shared-memory.ts`, 118 lignes ajoutées, aucune
ligne supprimée hors du commentaire d'en-tête.

`SharedGrant` porte `principal`, `realm` (`enterprise`|`team`|`project`|`personal`),
`scope` (`kind`+`id`) et `operations` (`search`|`read`). La clé est la
concaténation `principal`, realm, `kind:id`, séparée par un caractère nul, donc
un grant d'un realm n'est jamais hérité par un autre, et deux opérations sont
deux droits distincts.

`SharedGrants` est le registre contrôleur : `grant` valide et fusionne les
opérations d'une clé, `revoke` retire tout, une opération nommée, un scope, ou
toute la liste du principal. `allows` fait un `Map.get` à chaque appel : aucun
snapshot, aucun mémo, aucun jeton d'autorisation qui survit à son révocation.

`SharedRetrieval.search` et `read`/`readReference` gardent le registre en champ.
Avant chaque `store.read()` ils testent `allows(...,operation)`. Après la
projection ils testent encore, et `search` repasse sur tous les scopes qu'il a
ouverts, parce qu'un revocation peut être portée par un mount lu plus tard dans
le même appel. Un scope refusé ne produit ni hit, ni compte, ni entrée de digest :
`bases` ne reçoit que les scopes admis, donc le digest d'une portée entièrement
refusée est identique à celui d'un corpus vide.

`read` et `readReference` refusent un scope non déclaré avec le même message
qu'un scope refusé, pour qu'une scope ne soit pas sondable. `readReference` ne
contourne rien : une ancienne référence est une clé de lookup, elle repasse par
le même contrôle.

## Preuves

`rtk node --test --test-reporter=spec test/shared-memory.test.ts test/shared-memory-edit.test.ts` :
18 tests, 18 pass, 0 fail. Le fichier `test/shared-memory.test.ts` compte 14
tests, dont 4 nouveaux. `test/shared-memory-edit.test.ts` est inchangé et sert
de non-régression.

Les 4 tests nouveaux, ce qu'ils prouvent :

- Grant obligatoire avant search et avant read. `alice` sans grant obtient un
  résultat `deepEqual` à celui d'un `SharedRetrieval` sur un répertoire vide :
  aucun hit, aucun compte, aucun digest distinct. `read` et `readReference`
  lèvent. Après `grant(['search'])` le search trouve la passage et `read` lève
  encore. Après `grant(['read'])` les deux portes s'ouvrent. `bob` n'a rien.
  Un grant `project` n'ouvre rien en realm `team`.
- Révocation observée par l'appel suivant. `revoke` puis, sans rien reconstruire,
  le search d'un accesseur qui avait déjà rendu des données est `deepEqual` à un
  corpus vide, et il en va de même sur un accesseur neuf. `read`,
  `readReference` sur l'ancienne référence et sur une révision inconnue lèvent
  tous. `bob`, non nommé, est intact. Révocation partielle : retirer `read` laisse
  le search ouvert, retirer `search` le ferme.
- Révocation pendant la lecture. Un store qui révoque le scope précédent pendant
  son propre `read()` fait échouer le search du même appel, et le message ne
  contient ni le texte ni l'identifiant. Même construction sur `read` et sur
  `readReference`.
- Jamais ouvert si non accordé. Un mount dont le `context.jsonl` est du texte non
  JSON est dans la liste des scopes, sans grant : le search ignore le scope au
  lieu de le parser, donc la corruption ne se révèle pas. Après révocation du
  scope projet, le search ne rend plus que le hit organisation. Après
  `revoke({principal})` sans scope, l'identité révoquée est `deepEqual` à une
  identité inconnue.

Non-vacuité établie par mutation, deux mutants sur la branche :

- `allows` forcé à `return true` : exactement les 4 tests nouveaux échouent, les
  10 préexistants du fichier restent verts (10 pass, 4 fail).
- Suppression des trois re-vérifications après projection : seul le test de
  révocation en vol échoue (13 pass, 1 fail). C'est le seul test qui épingle
  cette garantie, il n'était donc pas redondant.

`rtk node_modules/.bin/tsc -p tsconfig.build.json` : 32 diagnostics `error TS`,
identiques avant et après, aucun dans `src/adapters/shared-memory.ts` ni dans les
deux fichiers de test. `git diff --check` propre.

## Limites

`SharedContexts.read()` reste la projection contrôleur pour l'inférence et
n'appelle pas le registre : c'est le chemin owner-local déjà couvert par E01.6a
et E01.5b1, il ne porte pas d'identité de principal et n'en Fabrique pas.
`SharedRetrieval` n'est encore câblé dans aucun runtime : le registre vit en
processus, il n'est ni distribué ni persisté. Aucune auth multi-machine, aucune
révocation à distance, pas de distribution équipe/personnel. E01.3 et le parent E01.6
restent ouverts sur ces points, comme le dit la section grants de
`11-SHARED-ORGANIZATION.md`.

Aucun travail sous `src/adapters/state-graph/`, `notifications.ts`,
`managed-worktrees.ts`, `agent-git.ts` ni `test/node-capsule.test.ts`. Aucun
fichier de `docs/harness/` existant modifié, un seul fichier créé ici.