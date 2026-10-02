# EV-STATE-GRAPH-PROOF-PLAN

2026-10-02. SG02.3, REQ-SG02, gap 2 de `EV-VERIFICATION-SELECTION-PROBE`. Le plan
adressable est livré : un nœud `test` impacté se résout en fichiers de test
exécutables, le plan porte les quatre groupes nommés par la tâche, il est trié de
façon stable et mis en cache par le digest de ses entrées.

Ce que cette tâche ne livre pas, et pourquoi, est en tête des limites : ni le tri
par risque, ni l'expansion de la couverture du manifeste.

## L'écart que la sonde avait mesuré

`ownerCheckCatalog(graph)` rend 16 liaisons invariant vers check, et le manifeste
déclare 16 nœuds `test` qui nomment chacun un vrai fichier dans `sourceRefs`. Ce qui
n'existait pas est la jointure : rien ne transformait un id de nœud impacté en chemin
exécutable, donc `computeChangeImpact` rendait des identifiants et aucun nom de
fichier. Le graphe connaissait les tests comme des ids, pas comme des commandes.

## La jointure

`src/adapters/state-graph/plan.ts`, `buildCheckIndex` puis `pathsForCheck` et
`checksForPath`, lus tous deux par une seule fonction `own()` :

```ts
const own=(table,key)=>{
 const bucket=Object.hasOwn(table,key)?table[key]:undefined;
 return Array.isArray(bucket)?bucket:EMPTY;
};
```

Les deux directions sont des `Object.fromEntries`, donc des objets ordinaires, et
`schema.ts` admet `constructor` comme identifiant de nœud **et** comme chemin de
source. Une lecture naïve rend `Object` là où le contrat promet un tableau. Ce n'est
pas un crash visible par l'appelant : c'est une recherche qui rapporte une
déclaration que personne n'a faite, exactement la forme de l'impact vide trompeur
que REQ-SG02 interdit. Les deux garde-fous ne sont pas redondants et le test le
prouve par mutation, voir M5 plus bas.

Une seule lecture par propriété propre ne suffit pas à démontrer le test lui-même,
parce que `Array.isArray` rattrape déjà une fonction. La fixture qui démonte le
garde-fou est un prototype dont la valeur héritée **est un tableau**, seul cas
qu'`Array.isArray` seul ne peut pas voir :

```ts
const inherited=Object.create({constructor:Object.freeze(['test/inherited.test.ts'])}) as Record<string,readonly string[]>;
inherited['test/normal.test.ts']=Object.freeze(['test.normal']);
```

Le piège est montré avant le refus (`inherited['constructor']` rend bien le tableau),
`Object.hasOwn` dit faux, et les deux accesseurs rendent `[]`. Puis la même clé,
déclarée comme propriété propre, est résolue normalement : le garde-fou admet les
déclarations, il ne rejette pas les clés de prototype par convention.

## Les deux espaces de noms

`notes.md` est admis comme id de nœud par `schema.ts`, et un dépôt peut contenir un
fichier de ce nom. Un seul graphe sert les deux moitiés, et les deux doivent rester
séparées :

- un `test` portant l'id `notes.md` déclare `test/notes.md` ; par id il rend
  `test/notes.md`, et par chemin `notes.md` ne le désigne pas ;
- une entité déclare le chemin `notes.md` ; comme aucune déclaration de check ne porte
  ce chemin, `checksForPath(index,'notes.md')` rend `[]`, là où une lecture par id
  aurait trouvé la check.

Ce qui est réellement asserté sur le plan est mesuré, pas supposé. Pour un changement
du chemin `notes.md`, `computeChangeImpact` passe la chaîne non résolue à la
fermeture, et la fermeture trouve le nœud dont l'id est cette chaîne : c'est
exactement ce que SG02.2 a mesuré, et c'est pourquoi le rétrécissement existe. Le
plan rapporte donc `tests: ['notes.md']` **et** `complete: false` avec
`incompleteReasons: ['coverage-unmapped-paths']` et `coverage: {declared: 0, unmapped:
1}`. La liste de tests vide aurait été une affirmation fausse : la collision est
atteinte, et c'est le marquage qui empêche de la lire comme de la couverture.

## La forme du plan

Quatre groupes, quatre, parce que la tâche en nomme quatre : `impactedNodes`,
`invariants`, `tests`, `jobs`. Les listes plates `testPaths`, `jobPaths` et
`unresolvedChecks` sont des **projections**, affirmées égales par test à la
déduplication ordonnée des chemins de leur groupe, donc pas un cinquième groupe.

Une sélection d'invariant est generouslye et jamais devinée : un invariant entre dans
le plan quand le changement l'a impacté, ou quand le changement a impacté un check
qui déclare le valider. Un check invalidé met ses propres affirmations en doute, et
les supprimer rétrécirait la vérification précisément sur l'entrée où le rétrécissement
est interdit. Les deux routes sont distinguées par test : sur le manifeste réel, un
changement de `test/objectives.test.ts` impacte le nœud invariant directement parce
que chaque nœud invariant déclare son propre fichier de test ; sur un graphe ou
l'invariant ne déclare qu'une source, le même résultat n'arrive que par le check.

`jobs` est le groupe des nœuds `ci`, les deux types que `ownerCheckCatalog` admet déjà
comme checks. Le manifeste courant n'en déclare aucun, donc `jobs` y est vide, ce qui
est reporté et non corrigé.

## Le digest et le cache

`planInputDigest` porte `graphRevision`, le digest canonique du registre
d'invariants, la politique de types d'arêtes, les bornes, et le jeu de changements
canonisé. Le registre est dans la clé pour une raison de correction et pas de
décoration : `graphRevision` couvre le graphe, et le graphe seul ne porte ni les
énoncés d'invariant ni leurs liaisons de check, qui vivent dans un registre
TypeScript. Deux exécutions sur un même graphe avec deux registres sont deux plans
différents qui partageraient sinon une adresse. Une adresse qui collide est pire
qu'aucune adresse, parce que l'appelant n'a rien pour le remarquer.

`canonicalChanges` garde `from` même sur un `kind` qui ne le consulte jamais.
`{path, kind:'modified'}` et `{path, kind:'modified', from:'x'}` sont une seule chose
pour une forme canonique négligente et deux choses différentes pour `mapChanges`, qui
refuse la seconde : elles sont donc sérialisées séparément. La canonicalisation est
totale et ne lève pas, ce qui permet d'adresser une requête avant de savoir si elle
est admissible. Un plan n'est stocké qu'après avoir été calculé, donc une entrée en
cache n'existe que pour une entrée que la fonction a acceptée.

Le cache est borné et **évince** au lieu de refuser. La distinction est délibérée :
une entrée oubliée se recalcule à partir d'entrées toujours en main, ce qui n'est pas
la même chose qu'un changement qui n'a atteint aucune seed. Un hit rend l'objet exact
que le miss a rendu, donc les deux sont indiscernables quant au contenu et seul
`cached` diffère. `resolve(digest)` rend le plan d'une adresse, ce qui est ce que
`get_required_tests` reçoit de STATE-GRAPH.

## Preuves

51 tests PASS, 0 fail sur les six fichiers de vérification, dont 41 avant ce lot :

```
node --test --test-reporter=spec test/state-graph-impact.test.ts \
  test/state-graph-loader.test.ts test/state-graph-invariants.test.ts \
  test/state-graph-manifest.test.ts test/state-graph-schema.test.ts \
  test/state-graph-plan.test.ts
```

`test/loadability.test.ts`, `test/portability.test.ts` et `test/hermeticity.test.ts`
restent verts (33 tests), le nouveau module n'étant ni exporté par `src/index.ts` ni
atteignable par un enfant non assommé.

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, inchangé, et
aucun situé dans `state-graph`.

### Déterminisme, trois exécutions

Trois processus séparés, même entrée :

```
run 1 72c007dc66babae4411819dd2727710e741913ded591a0e3c376ab804fc5a1da
run 2 72c007dc66babae4411819dd2727710e741913ded591a0e3c376ab804fc5a1da
run 3 72c007dc66babae4411819dd2727710e741913ded591a0e3c376ab804fc5a1da
```

Le plan fait 5971 octets pour ce changement, et son JSON a pour empreinte
`b07af7679870705bf95383fdb61582da8cc450510a1c961157e7f1a59fe297b8`. Le test le
prouve en trois plans in-process, plus un graphe dont nœuds, `sourceRefs`, références
et arêtes sont tous inversés, plus un jeu de changements inversé, plus trois processus
enfants dont l'environnement est assemblé par nommage. L'ordre de déclaration n'est
une entrée ni pour le plan ni pour son adresse.

### Cache contre calcul frais

```
cache miss/hit cached flags false true identical bytes true same object true
cache vs fresh true
hits 1 misses 1 size 1 resolve true
```

Un hit rend le même objet, donc la même octet, qu'un calcul frais, et `resolve`
reconduit l'adresse au plan.

### Non-vacuité, neuf mutants

Chaque groupe écarté fait échouer au moins un test. Un groupe qui ne peut pas échouer
ne vaut pas d'exister.

| Mutant | pass | fail |
| --- | --- | --- |
| M1 `impactedNodes` vidé | 6 | 4 |
| M2 `invariants` vidé | 8 | 2 |
| M3 `tests` vidé | 3 | 7 |
| M4 `jobs` vidé | 9 | 1 |
| M5 test de propriété propre retiré de la jointure | 9 | 1 |
| M6 `complete` élargi à `impact.complete` | 9 | 1 |
| M7 le cache ne rend jamais de plan mémoïsé | 9 | 1 |
| M8 registre retiré du digest du plan | 9 | 1 |
| M9 `testPaths` cesse d'être une projection de `tests` | 5 | 5 |

M6 est la règle gouvernante rendue non-vacante : sans le rétrécissement, un impact
inconnu rendrait un plan qui se présente comme complet.

### `complete` ne s'élargit jamais

Trois raisons, chacune un état réel, chacune atteignable seule, chacune lisant un
mécanisme qui existe déjà et qui a déjà ses tests : `coverage-unmapped-paths` vient du
rétrécissement SG02.2, `invariant-check-unresolved` et `invariant-unregistered` sont le
rapport de SG03.1 relu. Ajouter un chemin inconnu à un plan complet ajoute une raison
et **ne retire aucun test, aucun invariant, aucun chemin**.

Une raison « un check n'a pas de chemin » a été écrite puis retirée. `graphRevision`
revalide le graphe avant toute planification et `schema.ts` admet de une à trente-deux
références de source par nœud, donc un check qui ne résout vers aucun chemin est
inatteignable. Un code de raison inatteignable est pire qu'aucun code de raison, parce
qu'il se lit comme une couverture que personne ne vérifie.

## Limites

**La couverture du manifeste n'a pas été étendue, volontairement.** Trois sources
déclarées n'atteignent aucun test : `src/adapters/code-worker-integration.ts`,
`src/adapters/code-worker-loop.ts` et `src/adapters/managed-worktrees.ts`. La dernière
est le cas nommé par la sonde : seul `entity.workers.workspaces` la déclare, aucune
arête ne relie cette entité à `test.workers.worktrees`, donc le graphe ne sélectionne
rien et le plan dit honnêtement qu'il n'a rien sélectionné, avec `complete: true` et
`incompleteReasons: []`, parce que le chemin **est** déclaré. La lacune est dans les
arêtes, pas dans les chemins.

Élargir ici exigerait de deviner qu'un fichier de test appartient à un fichier source,
et c'est la seed devinée que SG02.2 interdit. Le test épingle les trois chemins, donc
corriger la couverture dans SG01.3 sera une édition visible et délibérée, pas une
dérive silencieuse. Le manifeste n'a pas été régénéré et `graph:regen` n'a pas été
lancé : `plan.ts` et son test ne sont pas des sources déclarées, donc aucun digest
n'aurait changé de toute façon. Le blob `.cuesheet-project/graph.json` est identique à
HEAD (`cfdd935ce3264b152571ae61bdc30e18b94287db`).

**Le manifeste ne déclare aucun nœud `ci`**, donc `jobs` est vide sur le graphe réel.
Le groupe est exercé sur un graphe synthétique. L'ajouter au manifeste changerait ses
digests et n'appartient pas à cette tâche.

**Le tri par risque et par irréversibilité n'est pas livré.** C'est le troisième manque
de la sonde et il est hors de cette tranche, qui porte le plan adressable. Rien ici ne
décide quels checks lancer, dans quel ordre, ni à quel niveau edit, commit, push ou
main : c'est la politique de l'appelant, comme le dit déjà le commentaire sur `CAUSAL`
dans `impact.ts`.

**Un fichier déclaré peut ne plus exister.** Le plan lit des déclarations et ne touche
pas au disque, donc un `testPaths` peut nommer un fichier supprimé. Le test le prouve
dans l'autre sens : chaque chemin rendu par le manifeste réel est un fichier
réellement présent. La présence sur disque est l'affaire du jeu de changements.

`src/core/**` n'a pas été touché. `manifest.ts`, `loader.ts` et `invariants.ts` n'ont
pas été touchés. `impact.ts` a reçu **un mot** : `CAUSAL` est maintenant exporté, parce
que le digest du plan lit cet ensemble au lieu d'en garder une copie, et qu'une politique
qui se nomme deux fois ne peut pas dériver en silence. `AC-SG02` reste PENDING : elle
exige aussi SG02.1 et l'intégration. `docs/harness/state.json` n'a pas été édité, SG02.3
y reste TODO jusqu'à l'intégration par l'orchestrateur.

SG02.3 porté à READY_FOR_MANUAL_ACCEPTANCE du point de vue de l'agent. L'état `DONE`
vient après l'acceptation humaine.
---

# Réparation : un plan complet doit nommer une preuve exécutable

Branche `sg02-3-no-witness`, ajoutée au lot SG02.3 par copie des mêmes quatre chemins,
puis réparée. Ce qui suit est le constat indépendant et la réparation ; la section
`Limites` plus haut reste en place et est **corrigée** par la première phrase de cette
section : ce qu'elle appelle « honnêtement qu'il n'a rien sélectionné » était en réalité
le défaut, parce qu'un plan qui ne nomme aucune preuve ne peut pas se déclarer complet.

Ce fichier est donc la seule surface de preuve touchée : un ajout au fichier déjà copié,
pas un fichier nouveau.

## Le défaut, reproduit avant toute modification

Sur le manifeste réel, `planVerification(graph,[{path:"src/adapters/managed-worktrees.ts",kind:"modified"}])`,
avant la réparation :

```
complete         : true
incompleteReasons: []
tests            : []
jobs             : []
testPaths        : []
impactedNodes    : 7     coverage {declared:1, unmapped:0}
```

Les trois chemins nommés se comportaient de même, et la cause est celle décrite : la
déclaration existe (`entity.workers.workspaces`), la fermeture atteint 7 nœuds réels,
et aucune arête ne relie cette entité à un nœud `test`. Le plan disait donc « j'ai
atteint des nœuds, voici ma couverture » sans jamais nommer une chose à exécuter.

La contradiction est visible dans le manifeste lui-même : `entity.workers.workspaces`
déclare **deux** fichiers. `src/adapters/code-worker-workspaces.ts` atteint
`test/code-worker-workspaces.test.ts` et `test/managed-worktrees.test.ts`, donc il est
couvert ; `src/adapters/managed-worktrees.ts` n'atteint rien. Même entité, même nœud
déclarant, une arête d'écart. C'est la preuve que la lacune est dans les arêtes.

## La règle, et le code qui la nomme

Un plan ne peut déclarer `complete: true` que s'il nomme au moins une preuve
exécutable, c'est-à-dire un groupe `tests` ou `jobs` non vide. Sinon la raison
s'ajoute :

| cause | code | réparation |
| --- | --- | --- |
| aucun nœud ne déclare le chemin | `coverage-unmapped-paths` | déclarer le chemin (grandir le manifeste) |
| le chemin est déclaré, rien ne le couvre | `coverage-no-executable-proof` | ajouter l'arête vers un nœud `test` |

Les deux codes sont distincts par construction, jamais un alias : la première porte sur
la **déclaration**, la seconde sur la **connexion**. Un changement qui contient les deux
les rend toutes les deux, donc un appelant ne peut pas les confondre en comptant les
raisons.

La porte est `impact.coverage.declared`, et c'est le point qui mérite l'attention : la
fermeture est amorcée aussi par les chemins non mappés, donc `impacted.length > 0` est
vrai également d'un chemin qui a atteint un nœud par simple collision de chaîne avec un
id. Écrire « déclaré et non couvert » pour ce cas nommerait une réparation que personne
ne peut faire : il n'y a pas d'arête à ajouter pour un fichier que le graphe n'a jamais
déclaré. `coverage-unmapped-paths` y est déjà le refus, et il est le seul. Le mutant
M11 le prouve.

## La décision sur les plans à invariants seuls : non acceptables

Un plan qui porte des invariants et aucun check n'est **pas** acceptable, et la décision
est dans le code (`tests.length===0&&jobs.length===0`, aucune clause sur `invariants`),
dans le commentaire de `VerificationPlan.complete`, et dans un test qui l'assert.

Un invariant est une **affirmation**, pas une commande. Le plan dit « cette affirmation
est en doute » et ne nomme rien qui puisse la mettre en doute. Compter l'invariant comme
témoin rendrait le plan complet, et le champ `invariants` non vide se lit comme une
couverture à qui parcourt la liste des champs : c'est le même trou silencieux avec un
chapeau différent. Le test construit exactement ce cas sur un graphe synthétique où
l'invariant est enregistré, lié et sélectionné, `enforced` vaut `true`, et où seul le
témoin exécutable manque : la seule raison qui reste est bien
`coverage-no-executable-proof`. Le même graphe, avec l'arête vers le check, devient
complet. La décision est donc visible des deux côtés.

Ce cas est **inatteignable sur le manifeste réel** : aucun des 41 chemins déclarés ne
produit d'invariant sans check. Il est donc exercé synthétiquement, comme `jobs`, et le
dossier le dit.

## Preuves

52 tests PASS, 0 fail sur les cinq fichiers de vérification, dont 47 avant la
réparation, et 15 dans `test/state-graph-plan.test.ts` dont 10 :

```
node --test --test-reporter=spec test/state-graph-plan.test.ts \
  test/state-graph-impact.test.ts test/state-graph-invariants.test.ts \
  test/state-graph-manifest.test.ts test/state-graph-schema.test.ts
```

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, inchangé, et
aucun situé dans `state-graph`.

### Non-vacuité, dans les deux sens

Quatre mutants de la seule ligne de dérivation, mesurés sur les cinq fichiers :

| Mutant | pass | fail | ce qui casse |
| --- | --- | --- | --- |
| M10 règle retirée | 46 | 6 | le plan sans check redevient complet |
| M11 porte sur `impacted.length` | 51 | 1 | une collision non mappée est dite déclarée |
| M12 `jobs` oublié | 51 | 1 | un plan dont le seul témoin est un job devient incomplet |
| M13 règle toujours vraie | 45 | 7 | plus aucun plan n'est complet |

M10 et M13 sont les deux directions exigées : la règle n'est pas vacuë, et elle ne rend
pas tout incomplet. Les six tests qui tombent sous M10 sont la preuve qu'elle est
portée par des états réels et pas par une seule assertion.

### Les trois chemins, et un chemin couvert

`src/adapters/managed-worktrees.ts`, `src/adapters/code-worker-integration.ts` et
`src/adapters/code-worker-loop.ts` rendent désormais `complete: false` avec
`incompleteReasons: ["coverage-no-executable-proof"]` et `coverage {declared:1,
unmapped:0}`, donc la cause nommée est bien la seconde et pas la première.
`src/adapters/session-store.ts` reste `complete: true`, `incompleteReasons: []`, avec
`test/adapters.test.ts` et `test/terminal-sessions.test.ts` en `testPaths`.

## Limites, mesurées

**La règle touche neuf chemins déclarés, pas trois.** Sur les 41 sources déclarées du
manifeste réel, neuf n'atteignent aucun check et sont donc maintenant incomplètes :

```
apps/terminal/src/producer/index.ts
apps/terminal/src/producer/session-view.ts
docs/ARCHITECTURE.md
docs/harness/01-OBJECTIVES.md
docs/harness/05-CONTINUITY.md
docs/harness/MULTI-WORKER.md
src/adapters/code-worker-integration.ts
src/adapters/code-worker-loop.ts
src/adapters/managed-worktrees.ts
```

Les trois de `src/` sont ceux que la sonde nommait. Les six autres étaient déjà
silencieux et le sont maintenant à voix haute. Aucun n'est un faux positif de la règle :
chacun est déclaré par un nœud, et aucun n'atteint de nœud `test` ou `ci`. Les
corriger reste la décision de couverture du manifeste, ici SG01.3, et le test épingle
la liste pour que cette fermeture soit une édition visible.

**La granularité est le plan, pas le chemin.** Un changement qui contient à la fois un
fichier déclaré sans témoin et un fichier déclaré couvert reste `complete: true` : le
second fournit la preuve. C'est épinglé par un test et non caché. La granularité par
chemin demanderait un champ nouveau sur le plan et une fermeture par chemin que la
forme actuelle ne porte pas ; c'est une décision de forme, pas un oubli, et elle n'est
pas prise ici.

**Aucun champ par chemin n'a été ajouté.** `VerificationPlan` garde exactement ses
quatorze clés, ce que le test de forme continue d'assert. Un appelant qui veut savoir
quel chemin manque de témoin doit le dériver lui-même en interrogeant le graphe, ce qui
est possible sans changer la forme mais n'est pas confortable.

**Le manifeste n'a pas été étendu.** `manifest.ts` et `.cuesheet-project/graph.json`
sont intacts, le blob reste `cfdd935ce3264b152571ae61bdc30e18b94287db`, et `plan.ts`
n'est pas une source déclarée donc aucun digest n'a bougé. `src/core/**` n'a pas été
touché. `docs/harness/state.json` n'a pas été édité, SG02.3 y reste TODO jusqu'à
l'intégration par l'orchestrateur, et `AC-SG02` reste PENDING.

Réparation portée à READY_FOR_MANUAL_ACCEPTANCE du point de vue de l'agent.
