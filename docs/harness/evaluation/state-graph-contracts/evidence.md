# EV-STATE-GRAPH-CONTRACTS

2026-10-02. SG05.1, REQ-SG05, AC-SG05. Références de contrats et règles de
compatibilité. Le corps de contrat structuré existe, il est déclaré hors du
manifeste, et le verdict de compatibilité ne peut pas être produit par un mock.

## L'écart

Le manifeste `.cuesheet-project/graph.json` déclare 11 nodes de kind `contract`
et aucun n'a de corps : champs, types, contraintes, erreurs, exemples et version
n'existent nulle part dans le dépôt. Il n'existait pas non plus de règle qui
disait quels changements entre deux versions de contrat sont cassants. Donc
« compatible » n'avait pas de sens calculable, et le seul moyen d'en produire un
était de l'affirmer.

Le piège qui rend cela plus grave qu'un manque : rien ne distinguait un rapport de
conformité d'une implémentation réelle d'un rapport de conformité d'un mock. Un
mock vert pouvait donc servir de preuve, et le critère AC-SG05 demande
exactement le contraire, « un mock passe mais le backend réel diverge :
compatibilité FAIL ».

## La forme retenue

Le contrat vit en TypeScript, dans `src/adapters/state-graph/contracts.ts`, et se
résout contre le manifeste commité. Pas dans le manifeste : `schema.ts` refuse
les clés inconnues, et y ajouter un corps rouvrirait une tranche déjà vérifiée.
C'est l'architecture que `invariants.ts` a déjà livrée, registre déclaré, catalogue
extrait du graphe, résolution qui rend un statut et une raison, écart dans les
deux directions, et un registre vide n'est jamais complet.

Une entrée déclare ce que le manifeste porte déjà, `id`, `domainId`, `ownerRef`,
`sources`, plus `formatVersion`, `version` et la liste des opérations. Chaque
opération porte ses entrées et ses sorties avec type et caractère obligatoire, ses
erreurs et ses exemples.

Le registre livré reprend les 11 nodes `contract` du manifeste, mêmes
identifiants, mêmes domaines, même owner, mêmes sources. Aucun node et aucune
edge ajoutés, donc le manifeste commité reste identique et `graph:regen` n'a été
ni requis ni exécuté.

Le test central vérifie chaque opération déclarée contre le fichier qu'elle cite :
un nom d'opération doit exister dans au moins une des sources déclarées. Un corps
de contrat qui revendquerait plus que ses sources serait une affirmation que rien
ne peut faire échouer, exactement le défaut que ce registre existe pour empêcher.
Trois opérations ont été retirées de la première version du registre parce que ce
test les a refusées, elles ne sont pas dans les sources citées.

### Les quatre motifs de résolution

`contract-present`, `contract-not-declared` (aucun node ne déclare l'entrée),
`contract-unknown` (l'id résout vers un node qui n'est pas un contrat) et
`contract-not-owner` (le node existe et appartient à un autre owner). L'écart
inverse, `unregisteredContracts`, rend les contrats que le graphe énonce et que le
registre ne porte pas.

### Les six règles et leur grammaire

Sur la forme canonique, donc sans exécution et sans mock :

1. `operation-removed`, une opération présente à la version précédente et absente
   à la courante casse.
2. `operation-added`, une opération ajoutée est rapportée et ne casse pas.
3. `input-now-required`, une entrée qui passe de facultative à obligatoire casse.
4. `required-output-removed`, une sortie obligatoire retirée casse, une sortie
   ajoutée non.
5. `type-changed`, un type modifié sur une entrée ou une sortie existante casse.
6. `error-removed`, un code d'erreur déclaré et retiré casse.

**Ce que la règle 2 ne peut pas faire, et pourquoi.** Le corps de contrat déclare
des opérations et aucun marqueur de renommage. Un renommage est donc observable
comme un retrait plus un ajout, et seule la moitié retrait est identifiable. Le
test le dit : un renommage produit `operation-removed` et `operation-added`, et le
verdict est `breaking`. Le rapport ne prétend pas qu'un nom est devenu l'autre,
parce que rien dans les sources ne permet de le savoir. La moitié non cassante de
la règle 2 est donc une contrainte nommée, avec son test, et `ADDITIVE_RULES` est
la liste qui empêche un ajout de décider un verdict. Une liste d'exemples garde
son ordre, les autres listes sont triées au comparateur ordinal, et c'est une
question ouverte, voir plus bas.

### FAIL contre UNKNOWN

Quatre verdicts, et rien d'autre. `compatible`, `breaking`, `divergent`, `unknown`.
FAIL est `breaking` et `divergent`, déclaré dans `FAIL_VERDICTS` et testé.

`compatible` exige les trois choses : aucune règle cassante, un rapport de
conformité d'implémentation réelle, et un rapport dont le `contractDigest` est
celui du contrat courant. Il n'y a aucun paramètre de mock dans l'entrée, un
rapport de mock forcé dans l'emplacement réel est refusé au runtime, et un rapport
lié à un autre contrat donne `unknown` avec la raison `report-digest-mismatch`.
Un mock vert n'est pas une entrée, donc un appelant qui n'a qu'un mock obtient
`unknown`, jamais `compatible`.

`unknown` n'est ni un FAIL doux ni un PASS doux. Le test l'affirme dans les deux
sens, `isFailVerdict('unknown')` est faux et le verdict n'est pas `compatible`.

Ce qui donne `unknown`, avec une raison nommée à chaque fois : aucun contrat
courant, aucune version précédente, une version de format que les règles ne
connaissent pas, une expression de type hors du vocabulaire, aucun rapport réel,
un rapport lié à un autre contrat.

## Preuves

18 tests PASS, 0 fail dans `test/state-graph-contracts.test.ts`.

Le test du mock porte les deux assertions dans le même test, parce que c'est leur
différence qui porte le critère : un mock vert sans rapport réel donne `unknown`,
un mock vert avec un rapport réel divergent donne `divergent`, et les deux sont
nommés dans le rapport.

**La limite, mesurée et non cachée.** Ce niveau refuse un rapport qui se déclare
mock, et il ne peut pas distinguer un rapport qui ment sur son propre sujet. Rien
ici n'observe l'implémentation, donc prouver qu'un rapport vient du réel est la
question de SG05.3. Un rapport re-marqué `real` avec le bon digest produit
`compatible` ici, et le test l'affirme au lieu de prétendre le contraire. C'est une
frontière, pas une garantie.

Non-vacuité établie par mutation. Le fichier est restauré à l'identique après
chaque mutation, sha256
`b14eab2afea05d65523f8bf8c8696535d9df36faf2067d4ba15618686ff69046`.

| Mutation | Résultat |
| --- | --- |
| règle 1, une opération retirée ne casse plus | 15 pass, 3 fail |
| règle 2, un ajout devient cassant | 15 pass, 3 fail |
| règle 2, elle tire aussi sur un retrait | 16 pass, 2 fail |
| règle 3, facultatif vers obligatoire toléré | 15 pass, 3 fail |
| règle 4, une sortie obligatoire retirée tolérée | 16 pass, 2 fail |
| règle 5, un type modifié toléré | 16 pass, 2 fail |
| règle 6, un code d'erreur retiré toléré | 15 pass, 3 fail |
| `unknown` compté comme FAIL | 15 pass, 3 fail |
| `unknown` compté comme compatible | 14 pass, 4 fail |
| garde de sujet mock retirée | 17 pass, 1 fail |
| liaison du digest de rapport retirée | 17 pass, 1 fail |
| table de types ordinaire, appartenance propre conservée | 17 pass, 1 fail |
| appartenance par recherche nue sur table sans prototype | 18 pass, 0 fail |
| index ordinaire **et** recherche nue, le défaut documenté | 17 pass, 1 fail |
| un registre vide passe pour complet | 17 pass, 1 fail |
| un identifiant livré dérive du manifeste | 16 pass, 2 fail |
| le digest cesse de trier les listes | 17 pass, 1 fail |

Une mutation survit, et elle est honnête de la nommer : un `Object.hasOwn` remplacé
par une recherche nue sur une table sans prototype ne change rien, parce que les
deux tests y coïncident. Ce n'est pas un défaut, et le test n'est pas trop strict
sur une construction en particulier. Le défaut réel, un index ordinaire plus une
recherche nue, est tué, et c'est lui qui est documenté dans
`state-graph-seed-mapping/evidence.md`.

Le piège de propriétés héritées est testé par un fixture nommé d'après un membre de
`Object.prototype` : `constructor`, `toString`, `valueOf`, `hasOwnProperty`,
`__defineGetter__`, `__proto__`. Chacun est refusé par la déclaration, avec le
champ nommé, et le test vérifie en plus que la recherche nue le résoudrait bien,
donc que le fixture est un vrai piège, et que la table d'appartenance n'a pas de
prototype.

Reproductibilité. Le même couple d'empreintes donne le même rapport octet à octet,
y compris l'ordre des raisons, dans le processus et au travers de trois processus
séparés lancés par le test lui-même. Un changement cassant et une entrée identique
donnent le même rapport, sha256 identique sur trois exécutions hors du suite,
`4fdf430d7eee68f1da351df897e2347129a1dabb8232c4a3e5aff25ac7f4eb5a`.

Voisins vérifiés séparément : `test/state-graph-schema.test.ts`,
`test/state-graph-manifest.test.ts`, `test/state-graph-invariants.test.ts` et le
nouveau fichier ensemble, 38 tests, 38 pass, 0 fail.
`test/loadability.test.ts` et `test/portability.test.ts` ensemble, 26 tests dans 6
suites, 26 pass, 0 fail, dont LOAD-01 qui importe chaque module de `src` et qui
charge donc le module ajouté, et PORT-05 qui parcourt `test/` et `src/`.

`tsc -p tsconfig.build.json` : 32 diagnostics `error TS` avant et après, aucun ne
nomme `contracts.ts`. Cette commande ne typechecke que `src/**/*.ts`, le fichier de
test n'entre donc pas dans ce compte.

Le manifeste est intact : `git status --porcelain .cuesheet-project` ne rend rien,
sha256 `7db99413a0e42bb519bbcf8799bdb1a61c75e4a1ba0403ee9eab9ecc78b1aa6b`, le
même octet pour octet que le checkout principal, et le test le prouve par égalité
avec `stateGraphJson(root)` ainsi que par les comptes 69 nodes, 76 edges,
11 contrats, 16 tests.

## Ce que ce lot ne livre pas, et qui le livre

AC-SG05 a deux moitiés. « Un mock passe et le backend diverge, compatibilité FAIL »
est la règle et le refus rendus ici, et le test le rend par le verdict
`divergent`. La preuve runtime, un rapport de conformité produit contre
l'implémentation réelle, est SG05.3, et c'est là que se décide la force de la
preuve, pas le verdict. « Seed identique, résultats reproductibles » est SG05.2 :
ce lot ne génère aucun mock et aucune fixture, et il ne consomme aucun seed. Ce qui
est vérifié ici est la reproductibilité du verdict lui-même.

## Questions ouvertes, traitées comme ouvertes

1. **Vocabulaire des expressions de type.** L'énumération n'est donnée par aucune
   source. Le validateur implémente un ensemble fermé et nommé,
   `TYPE_EXPRESSIONS`, tiré du vocabulaire que le dépôt possède déjà, et le refus
   est la valeur par défaut : une expression hors ensemble est refusée à la
   déclaration avec son champ nommé, et jamais approximée en chaîne. Le scénario
   5 est donc construit, mais le contenu de l'énumération reste la décision
   manquante. Un test l'exige : une expression hors ensemble qui passerait la
   déclaration doit quand même produire `unknown` au lieu d'être décidée.
2. **Direction de la compatibilité.** Non tranchée. Aucune règle ne répond à une
   valeur ajoutée dans une énumération fermée, pour un producteur ou pour un
   consommateur. Le scénario 7 est construit pour les six règles nommées, et son
   ensemble de règles est donc incomplet par rapport à cette question.
3. **Listes sémantiques.** Le module trie les sources, les opérations, les champs
   et les erreurs, et garde l'ordre des exemples. Aucune source ne dit quelles
   listes sont sémantiques. Le scénario 6 est construit et prouve que l'ordre seul
   ne bouge pas le digest, mais une liste déclarée sémantique changerait le digest
   de tous les contrats qui la portent. C'est la seule partie du scénario 6 qui
   reste ouverte.
4. **Définition d'un rapport de conformité réel.** Non tranchée, et SG05.3 la
   décide. Ce lot décide que le rapport existe, qu'il ne vient pas d'un mock et que
   son verdict peut être `divergent`. La limite mesurée ci-dessus est directement
   la conséquence de cette question.
5. **Version du format de contrat contre révision de node.** Le manifeste porte
   une `revision` de node entière et égale à 1 partout. Le corps de contrat porte
   sa propre `formatVersion`. Aucune source ne dit laquelle porte la règle de
   compatibilité ni comment les deux divergent. Le choix fait ici est explicite et
   réversible : les six règles comparent `version` du contrat, et `revision` de node
   n'est ni lu ni écrit par ce module. Le scénario 4 est construit, la relation
   entre les deux reste ouverte.

## Limites assumées

Le fichier de test du registre n'est pas lui-même un node `check` du manifeste.
Aucun node et aucune edge n'étant ajoutés, `graph:regen` n'est ni requis ni permis
dans ce lot, donc le registre n'est pas auto-certifié par le manifeste : il est
vérifié contre lui, et la dernière étape reste à l'intégration.

Le jeu de règles ne couvre pas ce que la question 2 laisse ouvert, et il ne le
prétend pas : aucun code ici ne prétend dire si une valeur ajoutée dans une
énumération fermée casse un producteur ou un consommateur.