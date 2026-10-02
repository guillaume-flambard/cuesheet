# EV-SHARED-GRANTS-FORGERY

2026-10-02. Tranche E01.6a, complément de `evaluation/shared-grants/evidence.md`.
Rien n'est modifié dans `docs/harness/`, `state.json`, `.cuesheet-project/` ni
`src/core/`. Deux fichiers touchés : `src/adapters/shared-memory.ts` et
`test/shared-memory.test.ts`.

## Le manque que cette tranche ferme

E01.6a livre `SharedReference {scope, id, revision}` : pas de `root`. La phrase
d'acceptation dit pourtant « même principal ne peut inventer root ou scope dans
référence », donc la référence doit pouvoir porter un root et le garde-fou doit
être visible. Un champ absent protège à la compilation seulement : à l'exécution
un objet venu d'un document ou d'un modèle est non typé, et `readReference`
ignorait silencieusement la propriété. Quatre clauses n'étaient donc prouvées par
aucun test existant :

1. une référence nommant scope A avec le root de scope B ;
2. un scope id inventé, root plausible ;
3. une référence déjà rendue, rejouée après révocation ou rejouée sur un autre
   scope ;
4. un root hors de tout scope déclaré, `..`, et un répertoire symlinké.

Les 4 tests E01.6a existants couvrent un scope refusé et une révocation. Aucun
ne forge de root.

## Le correctif source, 11 lignes ajoutées, 5 supprimées

`SharedReference.root?:string` et `SharedScopeStore.root?:string` en option, donc
aucun appelant n'est cassé et les doubles de test existants restent typés. Le
garde-fou est `namedRoot` : la racine d'une référence est comparée
lexicalement à la racine déclarée du store trouvé par le scope, avec `resolve()`
seulement. `resolve()` replie `..` sans toucher au système de fichiers : rien
n'est `stat`é du côté non fiable, donc une racine étrangère, traversée ou
symlinkée ne peut ni ouvrir un journal ni signaler si le chemin existe, et un
store qui n'a jamais déclaré son root ne peut pas être adressé par une racine.

`readReference` refuse avec le message exact d'un scope refusé
(`Shared memory read is not authorized.`), ce qui rend un refus de racine
indistinguable d'une révocation : la racine forgée ne devient pas un oracle.
Le refus précède `store.read()`. `readReference(null)` était un `TypeError` de
`Cannot read properties of null` ; la porte est maintenant totale et refuse
comme le reste. `force` n'apparaît nulle part et aucun chemin ne réussit en
silence.

Ce qui n'a pas demandé de correctif : `declared()` refusait déjà un scope jamais
déclaré, et la révocation était déjà vue à l'appel suivant. Ce que la matrice
ci-dessous montre, c'est que ces refus n'étaient pas distingués d'un « not
found », donc ils fuitaient l'existence du scope visé.

## Les 4 tests, ce qu'ils prouvent

- **Root forgé sur un autre scope.** Alice a légitimement les deux scopes. Le
  root fidèle du scope déclaré répond, et la référence honnête du scope B
  répond aussi, donc les refus ne sont pas un refus global. Le cas
  `{scope:A, id:entrée de B, root:B}` puis son image miroir
  `{scope:B, id:entrée de B, root:A}` refusent avec le message canonique. Un
  store spy compte les ouvertures : `opened === 0` après les quatre forgeries,
  `1` après la lecture honnête.
- **Scope id inventé.** Cinq formes (id foreign, id avec un zéro collé, kind
 organisation avec l'id projet, id avec espace, kind inconnu), chacune avec et
  sans root plausible, toutes le même message. Le scope honnête répond des deux
  côtés. Une référence qui n'est pas une référence refuse aussi.
- **Rejeu.** L'objet rendu puis rejoué intact après `revoke` refuse, sur
  l'accesseur qui l'avait déjà servi et sur un neuf. Un root A sur une référence
  B refuse ; un root B (ou pas de root) est une référence cohérente d'un scope
 accordé, elle est admise puis manque, et ne rend jamais l'entrée de A. La
  révocation qui nomme le scope projet laisse la porte organisation ouverte mais
  incapable de répondre par l'entrée projet. Enfin la re-vérification après
  projection est épinglée : un grant vivant à l'ouverture et dépensé par la
  lecture elle-même refuse avec `authorization changed`, sans le texte.
- **Root hors scope, traversée, symlink.** Sept racines : un répertoire
  extérieur réel avec son propre journal, son écriture `..`, un répertoire au
  journal corrompu, son écriture `..`, un symlink vers le scope accordé, son
  écriture `..`, `/etc`, et une barre finale. Toutes le même message, et le
  message ne contient ni « not a journal », ni « is not a directory », ni le
  texte de l'entrée : la corruption d'un répertoire outside ne se révèle pas.
  `..` est une normalisation et non une évasion, donc l'écriture qui retombe
  sur la racine accordée est admise, ce qui prouve que les refus ci-dessus ne
  sont pas une interdiction de toute racine.

## Non-vacuité par mutation

Cinq mutants appliqués un par un dans `src/adapters/shared-memory.ts`, tests
relancés à chaque fois, source restaurée et vérifiée identique. Les quatre
noms de test ci-dessous sont abrégés T1 root forgé, T2 scope inventé, T3 rejeu,
T4 racine extérieure.

| Mutant | Ce qui est affaibli | Tests en échec |
|---|---|---|
| M1 | le root de la référence choisit le store au lieu du scope | T1 T2 T3 T4 |
| M2 | `namedRoot` renvoie toujours vrai, aucune comparaison | T1 T3 T4 |
| M3 | `readReference` ne revérifie plus après la projection | T3 |
| M4 | une référence déjà servie répond depuis un cache, registre non demandé | T3 |
| M5 | les trois re-vérifications après projection supprimées | test E01.6a en vol + T3 |

Chaque test est tué par au moins un mutant. T2 est le seul que M2 ne tue pas :
un scope jamais déclaré est déjà refusé par `declared()`, Independentamment de
la racine. M3 est le résultat le plus important : avant ce complément, la
re-vérification après projection de `readReference` n'était tenue par aucun
test, y compris les 4 tests E01.6a, parce que le test en vol avait déjà
dépensé son grant et ne reliait donc que le contrôle d'avant lecture. Le
contrôle était du code mort vérifié par rien.

## Preuves de vérification

`rtk node --test --test-reporter=spec test/shared-memory.test.ts
test/shared-memory-edit.test.ts` : 22 tests, 22 pass, 0 fail, 0 skipped,
0 todo. `test/shared-memory.test.ts` passe de 14 à 18 tests, dont 4 nouveaux.
`test/shared-memory-edit.test.ts` est inchangé.

`rtk node_modules/.bin/tsc -p tsconfig.build.json` : 32 diagnostics
`error TS`, exactement le compte de base, aucun dans
`src/adapters/shared-memory.ts`.

`.cuesheet-project/graph.json` : sha256
`7db99413a0e42bb519bbcf8799bdb1a61c75e4a1ba0403ee9eab9ecc78b1aa6b`, identique
avant et après. `graph:regen` n'a pas été lancé : `shared-memory.ts` n'est pas
une source déclarée du graphe, l'artefact ne doit pas bouger et il n'a pas
bougé. `rtk git status --porcelain` ne montre que les deux fichiers de
l'allowlist, rien sous `.cuesheet-project/`. `rtk git diff --check` propre.

## Limites

`SharedRetrieval` n'est toujours câblé dans aucun runtime : le registre vit en
processus, il n'est ni distribué ni persisté. `SharedContexts.read()` reste la
projection contrôleur pour l'inférence et n'appelle toujours pas le registre.
Un scope store qui ne déclare pas son `root` refuse toute référence qui en
porte un : c'est fail-closed et voulu, mais un contrôleur futur qui construira
ses stores sans racine devra le savoir. La comparaison est lexicale et
n'existentialise pas les symlinks du chemin déclaré, ce qui est le bon sens
pour une garde ; l'inverse, un root qui résout vers la racine déclarée par un
chemin différent, est refusé. E01.3 et le parent E01.6 restent ouverts sur la
distribution et la persistance des grants.