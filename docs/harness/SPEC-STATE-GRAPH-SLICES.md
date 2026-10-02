# SPEC-STATE-GRAPH-SLICES : SG04.1 et SG05.1

2026-10-02. Document de spécification. Aucun code source n'est écrit par ce lot.
SG04.1 et SG05.1 restent TODO dans `state.json`, avec la note
« Specification only; no implementation claimed ». Ce document ne change ni
`state.json`, ni `STATE-GRAPH.md`, ni le manifeste, ni aucun test.

## Ce que ce document fait

Il écrit les scénarios manquants pour deux tâches P0 afin qu'un worker puisse les
implémenter sans inventer de comportement, et afin qu'un relecteur puisse vérifier
le résultat sans deviner l'intention. Pour chaque tâche : la forme retenue, les
règles de validation, les refus que le critère nomme, les scénarios à implémenter,
les preuves attendues, le hors périmètre, et les questions que les sources ne
tranchent pas.

## Ce qu'il ne fait pas

Il ne ferme aucun critère. AC-SG04 et AC-SG05 restent PENDING après une tranche
réussie, parce que chacune a deux moitiés qui appartiennent à des tâches
voisines. Une tranche vérifiée ne satisfait pas son AC parent. C'est la règle
écrite dans `WORK-GRAPH.md` et appliquée à tous les autres lots.

## Ce qui est déjà livré, et que cette spécification ne contredit pas

Lecture de l'état réel au commit `555e30b` :

- `src/adapters/state-graph/schema.ts` : parseur v1, champs inconnus refusés,
  clés strictement énumérées, résultat gelé, aucun fichier lu.
- `src/adapters/state-graph/loader.ts` : lecture du seul manifeste sous racine
  owner, empreinte sémantique `graphRevision`, diff lu au vocabulaire de git.
- `src/adapters/state-graph/impact.ts` : index inversé, fermeture, SCC, mapping
  diff vers seeds, `complete` rétréci et jamais élargi.
- `src/adapters/state-graph/invariants.ts` : registre déclaratif, résolution
  contre le catalogue owner, rapport `enforced` / `unenforced`, écart inverse.
- `.cuesheet-project/graph.json` : 69 nodes, 76 edges, 11 nodes `contract`,
  16 nodes `invariant`, 16 nodes `test`, un seul owner `owner.cuesheet`.
- Typecheck de référence : `tsc -p tsconfig.build.json` rend 32 diagnostics, dont
  aucun dans `state-graph`. Toute tranche doit laisser ce compte inchangé.

Deux constats de terrain qui commandent les choix ci-dessous :

1. Les 11 nodes `contract` du manifeste ne portent aucun corps structuré. Ils
   pointent des fichiers par `sourceRefs`, et leurs `invariantRefs` comme leurs
   `checkRefs` sont vides. Aucun des 11 ne porte de `contractRefs`. Le vocabulaire
   structuré que REQ-SG05 exige, champs, types, contraintes, erreurs, exemples et
   version, n'existe nulle part dans le dépôt.
2. Le vocabulaire `Event` de `src/core/store.ts` porte exactement cinq champs,
   `seq`, `at`, `kind`, `subject`, `data`, et `01-OBJECTIVES.md` exige un schéma
   versioné qui utilise les kinds existants. Aucun des champs que SG04.1 nomme,
   actor, causation, contexte, preuve, idempotence, n'existe aujourd'hui.

# SG04.1 : enveloppe d'événement

## L'écart

`STATE-GRAPH.md` nomme douze champs que le dépôt ne possède pas. L'écart n'est
pas un manque de code, c'est un manque de contrat écrit : rien ne dit aujourd'hui
quel actor est admis, ni ce qu'est une causalité valide, ni ce qui distingue une
reprise idempotente d'un doublon, ni où s'arrête une lecture face à un record
tronqué. Un worker qui écrit l'enveloppe maintenant invente ces quatre règles, et
son rapport n'est vérifiable par personne.

## La forme retenue

Le journal reste celui qui existe. L'enveloppe est un surensemble strict de
`Event` : les cinq champs legacy ne changent ni de nom, ni de valeur, ni de place.
`01-OBJECTIVES.md` l'impose, « utiliser les kinds existants », donc le vocabulaire
`EVENT_KINDS_OF_STORE` est réutilisé tel quel et aucun kind n'est ajouté.

Onze champs nouveaux sont stockés sous leur propre nom, et deux des noms de
STATE-GRAPH.md ne sont pas des champs supplémentaires mais une lecture. En
compte, les douze items que STATE-GRAPH.md énumère donnent treize clés, parce que
`source/evidenceRefs` se lit comme deux champs et non comme un seul :

| Champ stocké | Type | Règle |
| --- | --- | --- |
| `eventId` | string | identifiant stable, 1 à 128 caractères, alphabet `[a-zA-Z][a-zA-Z0-9._:-]`, unique dans le store |
| `schemaVersion` | entier | entier sûr positif, 1 au minimum |
| `taskId` | string | identifiant stable, même alphabet que `eventId` |
| `idempotencyKey` | string | identifiant stable, même alphabet, unique par couple `(taskId, idempotencyKey)` |
| `actor` | string ou null | identifiant owner, jamais une capacité |
| `causationId` | string ou null | `eventId` existant, ou null seulement si `streamSeq` vaut 1 |
| `correlationId` | string ou null | identifiant stable, ou null |
| `objectiveRevision` | entier ou null | entier sûr positif |
| `contextRevision` | string ou null | empreinte hexadécimale du contexte courant |
| `sourceRefs` | tableau | 0 à 32 entrées `{path,digest}`, mêmes règles de forme que `schema.ts` |
| `evidenceRefs` | tableau | 0 à 32 identifiants stables |

Deux champs sont lus sous deux noms, et un seul est stocké :

- `streamSeq` est la valeur de `seq`. Le champ `streamSeq` n'est pas écrit dans
  le record. Le type exposé expose les deux noms.
- `payload` est la valeur de `data`. Le champ `payload` n'est pas écrit dans le
  record.

Cinq champs sont obligatoires comme clé, et leur valeur peut être nulle : `actor`,
`causationId`, `correlationId`, `objectiveRevision`, `contextRevision`. La
distinction est le refus. Une clé absente est un record tronqué ou malformé, donc
refusé. Une clé présente et nulle est un champ que cet événement ne porte pas.
Une clé absente ne doit jamais être lue comme une clé nulle, parce qu'un record
tronqué deviendrait alors un record valide au lieu d'être refusé.

### Héritage des records existants

Un événement écrit avant cette tranche ne porte aucun des champs nouveaux. Il est
lu, projeté et conservé, et il est marqué legacy par dérivation, pas par un
nouveau champ : un record est legacy quand les clés `eventId`, `schemaVersion`,
`taskId` et `idempotencyKey` en sont absentes. Aucun octet n'est réécrit, et
`STATE-GRAPH.md` l'interdit explicitement, « les anciens événements sont migrés
explicitement, sans réécrire leur auteur ».

Trois règles sur un record legacy :

- La migration est calculée à la lecture. Aucun fichier n'est touché pour
  qualifier un ancien événement.
- Un `actor` absent reste absent. Il ne devient jamais `owner.cuesheet` par
  défaut, ni « inconnu », ni le nom du lecteur.
- Un record legacy se lit et se projette. Il ne peut pas être réécrit par le
  nouveau chemin d'écriture. Réécrire un ancien événement pour lui donner un actor
  serait réécrire son auteur.

### Bornes

Une valeur hors énoncé est refusée, jamais complétée ni interprétée. Les bornes v1
retenues ici sont des constantes nommées, parce que `STATE-GRAPH.md` diffère
explicitement les seuils à fixer avant chaque tâche :

- `payload` : 65536 octets de forme canonique.
- `sourceRefs` et `evidenceRefs` : 32 entrées chacun.
- `streamSeq` : entier sûr positif, 1 au minimum.

### La forme canonique et l'empreinte

`at` reste l'horloge injectée, jamais lue depuis `Date` à l'intérieur, et elle ne
participe ni à l'ordre ni à l'empreinte. L'ordre fait foi par séquence et CAS.
Deux enveloppes dont les `at` sont inversées se rejouent dans le même ordre et
donnent la même empreinte.

`envelopeDigest` est une fonction dérivée, pas un champ stocké. Elle vaut le
SHA256 de la forme canonique de l'enveloppe, `at` exclue, clés dans un ordre
fixe déclaré, listes triées au comparateur ordinal, aucun locale, aucune horloge.
Elle ne dépend d'aucun nom de machine, d'aucun chemin absolu et d'aucun champ
d'environnement. C'est la même discipline que `graphRevision`, appliquée à un
record.

### Validation d'un champ, et le piège des propriétés héritées

Chaque champ est validé par sa propre valeur, jamais par sa présence dans un
objet. Un test nommé `constructor`, `toString` ou `valueOf` doit être refusé
comme un champ malformé, jamais accepté comme une propriété héritée. Ce n'est pas
une précaution théorique : `evaluation/state-graph-seed-mapping/evidence.md`
documente le défaut exact, `bySourcePath` construit par `Object.fromEntries` qui
renvoyait `Object` pour un fichier nommé `constructor`, et l'impact vide complet
qui en découlait. La même classe de bug attend le même champ ici.

L'ensemble résultat est gelé, comme `parseStateGraph`. Le validateur ne lit et
n'écrit aucun fichier, et son résultat ne vaut ni preuve ni permission.

## Unicité, idempotence et doublon

Trois issues distinctes que le critère appelle toutes « doublon » :

1. **Reprise exacte.** Même `eventId` et même `envelopeDigest`. Le store ne crée
   aucun second enregistrement et rend l'enregistrement déjà stocké. Le journal est
   identique octet à octet avant et après.
2. **Doublon divergent sur l'identité.** Même `eventId`, empreinte différente.
   Refusé. Aucun append.
3. **Doublon divergent sur la clé.** Même couple `(taskId, idempotencyKey)` et
   `eventId` différent. Refusé, quel que soit le contenu.

La reprise exacte n'est pas un refus. `STATE-GRAPH.md` exige « reprise idempotente »
et le journal partagé exige déjà qu'une répétition exacte ne duplique pas et
qu'une même clé utilisée autrement refuse. Une fin de processus qui relance le
même append doit donc pouvoir le faire. C'est le point de lecture le plus
important de cette section, et il est explicite parce que la formulation du
critère, « doublon ... refusés », se lirait sinon comme un refus des deux cas.

## L'ordre des contrôles

L'ordre est celui que `src/adapters/shared-memory.ts` applique déjà pour
`create` : l'identité d'abord, le conflit de base ensuite.

1. Forme de l'enveloppe. Champ par champ, avec le nom du champ fautif.
2. Reprise exacte. Succès sans append, avant toute vérification de base.
3. Doublon divergent, identité puis clé. Refus.
4. CAS. Refus si la base attendue n'est pas la tête du flux.
5. Append.

Un retry exact reste donc idempotent même quand la base attendue est périmée,
sinon aucune reprise après crash ne fonctionnerait. C'est vérifiable et c'est une
raison de le nommer.

## Les trois refus que le critère nomme

**CAS périmé.** La base attendue est un argument de l'appel, jamais un champ de
l'enveloppe. Une base qui n'est pas la tête du flux est refusée, aucun append,
historique identique, et le refus nomme la base attendue et la base réelle. Aucun
rebase silencieux, aucun réessai sans relecture.

**Record tronqué.** Une dernière ligne partielle, une ligne dont un champ manque,
un octet UTF-8 invalide, une séquence non dense : la lecture refuse et ne rend
aucune projection. Aucun enregistrement après le défaut n'est appliqué. Aucun octet
n'est réécrit. Le refus nomme le `streamSeq` fautif. C'est le comportement déjà
livré, `replayAll` qui refuse au premier écart de séquence et la lecture du
journal partagé qui refuse au premier record invalide, avec le même message de
forme.

Une conséquence assumée : la queue coupée en cours d'écriture n'est pas réparée
tout seule. Une lecture refusée ne devient pas une lecture tronquée et silencieuse.
La réparation d'une queue coupée est une opération explicite, elle appartient à
SG04.3 avec les checkpoints et les tests de panne.

## Scénarios à implémenter

Chaque scénario est un test nommé. Chaque test affirme l'observation attendue
avant toute assertion de sortie, donc il échoue sur la branche défectueuse.

1. **Enveloppe minimale valide.** Tous les champs au nominal, résultat gelé, aucun
   fichier créé, aucun fichier lu, aucun octet écrit.
2. **Refus champ par champ.** Pour chacun des onze champs stockés : type faux,
   chaîne vide, valeur hors borne, clé absente. Le refus nomme le champ.
3. **Héritage piégé.** Une enveloppe dont un champ vaut `constructor`, `toString`
   ou `valueOf` est refusée comme malformée.
4. **Base de flux vide.** Un flux sans enregistrement a une base de moins un, et le
   premier append-conditionnel obtient `streamSeq` 1, jamais 0. Cette règle n'est
   pas décorative : le défaut E01.D1 a exactement fait produire un 0 pour une base
   de moins un, et il est documenté dans `11-SHARED-ORGANIZATION.md`.
5. **Séquence non dense.** `1,2,4` refusé. `2,1` refusé. Aucune projection rendue.
6. **L'ordre ignore l'horloge.** Deux enveloppes dont les `at` sont inversées se
   rejouent dans l'ordre de `streamSeq`, et le résultat est identique à celui du
   même couple sans inversion.
7. **Replay fidèle.** Reparser un journal écrit rend des enveloppes deep-equal à
   celles écrites, et `envelopeDigest` est identique avant et après.
8. **Reprise exacte.** Même `eventId`, même empreinte : aucun append, retour de
   l'enregistrement existant, octets du journal inchangés.
9. **Reprise exacte avec base périmée.** Elle reste idempotente, grâce à l'ordre
   des contrôles. Sans cela, la moitié reprise idempotente de AC-SG04 est
   inatteignable, parce qu'un crash laisse la base derrière la tête du flux.
10. **Doublon divergent sur l'identité.** Même `eventId`, empreinte différente :
    refus, aucun append, historique identique.
11. **Doublon divergent sur la clé.** Même `(taskId, idempotencyKey)`, `eventId`
    différent : refus, aucun append, historique identique.
12. **CAS périmé.** Base attendue fausse : refus nommant attendu et réel, aucun
    append, historique identique. Base correcte : append, tête avancée d'un cran.
13. **Causation.** `causationId` pointant un `eventId` absent est refusé.
    `causationId` nul avec `streamSeq` supérieur à 1 est refusé.
14. **Actor.** Une enveloppe rejouée dont `actor` est un objet, un nombre, un
    tableau ou `null` hors legacy est refusée. L'actor n'est jamais accepté
    comme une preuve, et le lecteur ne dérive jamais un actor d'un nom de machine
    ou d'un champ d'environnement.
15. **Record tronqué.** Journal dont la dernière ligne est un JSON partiel, ou
    une ligne valide à champ manquant, ou un UTF-8 invalide : la lecture refuse
    entièrement, aucun enregistrement ultérieur n'est appliqué, aucun octet
    réécrit, le refus nomme le `streamSeq`.
16. **Bornes.** `payload` au-delà de 65536 octets canoniques refusé. Plus de 32
   `evidenceRefs` refusé. `digest` non hexadécimal sur 64 refusé. Chemin de
   `sourceRefs` absolu ou remontant refusé.
17. **Forme canonique.** Deux enveloppes semanticement identiques mais écrites avec
   un ordre de clés et un ordre de listes différents donnent la même empreinte.
    Une valeur modifiée donne une empreinte différente.
18. **Non-vacuité par mutation.** Au moins quatre mutants nommés, avec le compte
    exact de tests en échec pour chacun. C'est la pratique des trois preuves
    `state-graph` livrées, elle n'est pas optionnelle ici.

## Preuves attendues

Un fichier `docs/harness/evaluation/state-graph-events/evidence.md`, suivant la
forme des trois preuves déjà livrées : l'écart trouvé, la forme retenue, les
mutants avec leur compte exact, les limites assumées. Les preuves
obligatoires :

- Le fichier `node --test --test-reporter=spec test/state-graph-events.test.ts`
  avec le compte de tests et le compte d'échecs.
- Les quatre fichiers de vérification voisins, comme le fait la preuve
  seed-mapping : impact, loader, manifest, schema.
- `test/loadability.test.ts` et `test/portability.test.ts`, dont PORT-05 parcourt
  `test/` et `src/` : un module ajouté sous `src/adapters/state-graph/` est
  chargé et vérifié automatiquement.
- `tsc -p tsconfig.build.json` : 32 diagnostics avant et après, aucun ne nommant
  le fichier ajouté.
- Le manifeste versionné est inchangé et le test le prouve par égalité octet à
  octet avec une reconstruction fraîche.

## Hors périmètre

Une tranche bornée ne ferme pas son parent. Les points suivants restent ouverts
après SG04.1, et nommer une tâche ne la livre pas :

- **Projection et transitions.** La projection par `taskId`, la table de
  transitions, l'append conditionnel projeté et la migration des plans existants
  sont SG04.2. SG04.1 livre l'enveloppe et son refus, pas l'état reconstruit.
- **Checkpoints et reprise.** Les checkpoints reconstruisibles, l'adressage des
  références et les tests de panne sont SG04.3. La réparation d'une queue coupée
  est là aussi.
- **Migration de fichiers.** SG04.1 qualifie un ancien record à la lecture. Il
  n'écrit aucun journal existant et ne migre aucun fichier de session ni de
  contexte partagé. L'écriture de cette migration est SG04.2.
- **Kinds métier.** Aucun kind n'est ajouté. Les événements métier que
  `STATE-GRAPH.md` annonce, actions, admissions, observations, sont émis par
  SG04.2 et par le registre owner, pas par l'enveloppe.
- **Registre owner.** L'enveloppe valide la forme d'un `actor`. Le registre owner
  qui dit quels acteurs existent et quelles capacités ils portent n'est pas
  livré et n'appartient pas à cette tranche. Aucun champ d'enveloppe n'accorde une
  capacité, et un actor déclaré n'en est pas la preuve.
- **Noyau.** `src/core/store.ts` n'est pas modifié. La première tranche est
  explicitement sans modification de `src/core`.
- **Manifeste.** SG04.1 n'ajoute aucun node et aucune edge. Le manifeste commité
  reste identique et `graph:regen` n'est ni requis ni permis.
- **Autorité de preuve.** Aucune preuve n'est créée ni validée ici. Le runner et
  ses verdicts sont SG03.2, l'invalidation événementielle SG03.3.
- **Contexte.** La compilation du sous-graphe et le binding du contexte aux tâches
  sont SG06.1 et SG06.2. `contextRevision` est ici une empreinte validée en forme,
  rien de plus.
- **Critère.** AC-SG04 reste PENDING après SG04.1. Sa moitié « replay égale
  projection sans checkpoint » exige SG04.2 pour la projection et SG04.3 pour le
  checkpoint. SG04.1 ne peut en prouver que la moitié qui lui appartient, le replay
  des enveloppes et leur refus.

## Questions ouvertes

Ces points ne sont tranchés par aucun document lu. Un worker ne doit pas les
décider seul.

1. **Dérivation de `eventId`.** STATE-GRAPH.md nomme le champ mais pas sa production. Deux
   voies défendables : le store l'assigne, comme il assigne `seq` aujourd'hui, ce
   qui préserve la règle « `seq` n'est pas un paramètre » ; ou c'est un digest du
   contenu, ce qui rend l'identité reproductible hors store. La première est
   cohérente avec le code livré, la seconde avec la reprise après crash. Non
   tranché.
2. **`source/evidenceRefs`.** STATE-GRAPH.md écrit les deux sur une ligne, séparés par une
   barre oblique. La lecture retenue ici est deux champs distincts, parce que les
   deux notions existent déjà séparément dans le dépôt, `SourceRef` avec son
   digest dans le graphe et les preuves avec leur verdict ailleurs. La lecture
   inverse, un seul champ polymorphe, reste possible.
3. **Représentation de `contextRevision`.** STATE-GRAPH.md décrit ce que cette révision
   identifie, le graphe, le contrat d'objectif, les sources, les scopes, les
   mémoires, mais ne fixe pas sa forme. Le choix retenu ici est une empreinte
   hexadécimale, parce que la même section parle de refus sur un « expected
   digest » obsolète. Une révision entière reste possible.
4. **Identité de tâche dans le graphe.** `taskId` ne peut pas être résolu contre le
   manifeste aujourd'hui : `schema.ts` n'a pas de kind `task`, et le graphe commité
   n'a aucun node de tâche. La validation ne porte donc que sur la forme. Faut-il
   ajouter un kind, déclarer les tâches autrement, ou accepter que `taskId` reste
   une identité extérieure au graphe, la réponse n'est pas dans les sources.
5. **Redondance `subject` et `taskId`.** `subject` existe et reste utilisé par les
   appels livrés, y compris pour des flux qui ne sont pas des tâches. Faut-il le
   déprécier au profit de `taskId` pour les flux de tâches, ou le laisser libre,
   la question est ouverte et la laisser libre crée deux noms pour une valeur sur
   les flux de tâches.
6. **Atomicité d'un append.** La spécification dit ce qu'une lecture refuse face à
   une queue coupée. Elle ne dit pas si l'écriture garantit qu'un append est tout
   ou rien. C'est une propriété du store, pas de l'enveloppe, et c'est ce qui
   décide si un crash peut laisser une queue coupée en pratique.
7. **Preuve obligatoire.** Le champ `evidenceRefs` est obligatoire comme clé et
   accepte un tableau vide. Quels événements doivent en porter une, et laquelle
   décide qu'une transition de statut est prouvée, relève de SG04.2 et SG03.2.
   Ce document ne l'invente pas.

# SG05.1 : références de contrats et règles de compatibilité

## L'écart

REQ-SG05 demande des contrats versionnés qui produisent des fixtures et des
mocks déterministes, et une vérification des consommateurs et de l'implémentation
réelle indépendante des mocks. Le dépôt n'a ni corps de contrat, ni version de
format de contrat, ni règle de compatibilité. Les 11 nodes `contract` du manifeste
sont des pointeurs vers des fichiers. Un worker qui écrit ces règles maintenant
invente le vocabulaire de types, la liste des changements cassants et la direction
de compatibilité, et son rapport ne prouve rien.

## La forme retenue, et où elle vit

Le contrat structuré ne va pas dans le manifeste. `schema.ts` refuse les clés
inconnues, et `STATE-GRAPH.md` qualifie son format v1 de strict avant
implémentation. Toucher `schema.ts` rouvrirait une tranche déjà vérifiée pour y
ajouter un corps que personne n'a demandé sous cette forme.

Le contrat vit donc en TypeScript, dans un module déclaré, et se résout contre le
manifeste commité. C'est exactement la forme que `invariants.ts` a déjà livrée et
vérifiée : un registre déclaré, un catalogue extrait du graphe, une résolution qui
rend un statut et une raison, et un écart dans les deux directions. SG05.1 copie
cette architecture, y compris sa contrainte la plus importante, un registre vide n'est
jamais complet.

Le registre livré reprend les 11 nodes `contract` du manifeste commité, avec les
mêmes identifiants, les mêmes `domainId`, le même `ownerRef` et les mêmes
`sourceRefs`. Comme aucun node et aucune edge ne sont ajoutés, le manifeste commité
reste identique octet à octet et `graph:regen` n'est ni requis ni permis.

Une entrée de contrat déclare, en plus de ce que le manifeste porte déjà : la
version du format de contrat, la liste des opérations, et pour chaque opération
les entrées avec leur type et leur caractère obligatoire, les sorties, les erreurs
et les exemples.

## Comment une référence de contrat se déclare

Une référence de contrat est un node de kind `contract` du manifeste, résolu
contre une entrée du registre déclaré. Les quatre motifs de résolution sont
repris de `invariants.ts`, parce que ce sont les quatre qui y ont été prouvés :

- `contract-present` : le node existe et le même owner le porte.
- `contract-not-declared` : le registre porte l'entrée, aucun node ne la déclare.
- `contract-unknown` : la référence ne résout vers aucun node.
- `contract-not-owner` : le node existe et appartient à un autre owner.

Un rapport ne plie jamais un écart en compte. Il nomme chaque référence qui n'a
pas résolu, comme le fait le rapport d'invariants, et l'écart inverse, un contrat
que le graphe énonce et que le registre ne porte pas, est rendu séparément.

## Comment la compatibilité se décide

Une seule règle porte le critère, et elle est normative :

> Un mock n'est jamais une entrée de la décision de compatibilité.

Un rapport de mock vert ne produit pas un verdict de compatibilité. Il produit au
mieux la preuve qu'un mock généré est conforme à un contrat, ce qui est une autre
phrase. `STATE-GRAPH.md` l'écrit déjà, « un mock conforme ne prouve pas un backend
conforme », et R-SG4 reste OPEN pour la même raison.

La décision est donc une fonction pure de trois entrées :

1. l'empreinte canonique du contrat déclaré à la version précédente ;
2. l'empreinte canonique du contrat déclaré à la version courante ;
3. un rapport de conformité d'une implémentation réelle, construit sans le mock.

L'empreinte de contrat est calculée comme `graphRevision`, clé à ordre fixe,
listes triées au comparateur ordinal, aucun locale, aucune horloge, aucun nom de
machine. Le rapport de compatibilité rend un verdict, les règles qui ont tiré, et
les raisons triées. Deux évaluations de la même paire d'empreintes rendent un
rapport identique octet à octet. Cette reproductibilité est structurelle, elle ne
dépend d'aucun test et d'aucun mock.

### Les règles de changement cassant

Six règles sont nommées et chacune a son test. Elles sont entre la version
précédente et la version courante, sur la forme canonique, donc sans exécution.

1. Une opération présente à la version précédente et absente à la courante casse.
2. Une opération renommée casse. Une opération ajoutée ne casse pas.
3. Une entrée qui passe de facultative à obligatoire casse.
4. Une sortie obligatoire retirée casse. Une sortie ajoutée ne casse pas.
5. Un type modifié sur une entrée ou une sortie existante casse.
6. Un code d'erreur déclaré et retiré casse, parce qu'un consommateur qui
   aiguille dessus doit savoir que le cas disparaît.

Le vocabulaire est celui de `STATE-GRAPH.md`, champs, types, contraintes,
erreurs, exemples et version, plus les bornes de refus déjà livrées.

## Ce qui donne FAIL, et ce qui donne UNKNOWN

Le critère demande « compatibilité FAIL » quand un mock passe et que le backend
réel diverge. Le verdict a donc une grammaire fermée, et UNKNOWN n'est jamais une
version douce de compatible.

Quatre verdicts seulement :

- `compatible` : aucune règle cassante n'a tiré, et un rapport de conformité
  d'implémentation réelle existe pour la version courante et conclut conforme.
- `breaking` : au moins une règle cassante a tiré. Le verdict ne dépend d'aucun
  rapport, ni mock, ni réel.
- `divergent` : un rapport de conformité existe et conclut divergent. Le verdict
  ne dépend d'aucun mock.
- `unknown` : le verdict ne peut pas être décidé honnêtement.

FAIL est produit par exactement deux situations, `breaking` et `divergent`. Le cas
du critère est le second : mock vert plus rapport réel divergent donne
`divergent`, jamais `compatible`, et le rapport nomme la divergence.

UNKNOWN est produit, et doit le rester, dans quatre situations :

- Aucun rapport de conformité d'implémentation réelle n'existe. Un rapport de
  mock seul donne `unknown`, jamais `compatible`.
- Le contrat est à sa première version déclarée et n'a pas de version précédente.
  Il n'est pas cassant par défaut, mais il n'est pas davantage compatible avec
  quoi que ce soit.
- La version courante du contrat n'est pas une version que l'ensemble de règles
  connaît. Une version inconnue ne se dégrade pas en « compatible ».
- Une expression de type est hors du vocabulaire supporté, donc la règle
  correspondante ne peut pas trancher. `STATE-GRAPH.md` l'exige, « expression non
  supportée refuse la génération ».

Ce qui n'est pas un verdict : un mock vert. Un check qui passe. Une empreinte qui
n'a pas bougé. Aucun de ces quatre ne produit `compatible`.

## Scénarios à implémenter

1. **Registre livré contre le manifeste commité.** Pour chacun des 11 contrats :
   le node existe, il est de kind `contract`, même `domainId`, même `ownerRef`,
   mêmes `sourceRefs`. L'écart inverse est vide sur ces données réelles, pas
   seulement sur des graphes de fixture.
2. **Écart dans les deux directions.** Un registre vide donne les 11 contrats du
   graphe dans l'écart inverse. Une entrée déclarée absente du graphe donne
   `contract-not-declared`, nommée.
3. **Owner.** Un node de contrat qui appartient à un autre owner donne
   `contract-not-owner`, avec le node nommé.
4. **Version.** Une version qui n'est pas un entier sûr positif est refusée à la
   déclaration. Une version inconnue des règles ne rend jamais `compatible`.
5. **Expression hors vocabulaire.** Un type qui n'appartient pas au vocabulaire
   supporté est refusé à la déclaration, avec le champ nommé, et n'est jamais
   traité comme une chaîne.
6. **Empreinte de contrat.** Le même contrat réordonné, clés et listes, donne la
   même empreinte. Une valeur modifiée donne une empreinte différente. Le rapport
   ne contient ni horloge, ni chemin absolu, ni nom de machine.
7. **Les six règles cassantes.** Un test nommé par règle, plus un test qui
   énumère les six motifs et attend `compatible` quand aucun ne tire.
8. **Le mock n'entre pas.** Un rapport de mock vert avec aucun rapport réel donne
   `unknown`. Un rapport de mock vert avec rapport réel divergent donne
   `divergent`. Les deux assertions dans le même test, parce que c'est la
   différence entre eux qui porte le critère.
9. **Reproductibilité.** Deux évaluations de la même paire d'empreintes rendent un
   rapport identique octet à octet, y compris l'ordre des raisons.
10. **Première version.** Un contrat sans version précédente donne `unknown`, pas
    `breaking` et pas `compatible`.
11. **Les objectifs ne sont pas remplacés.** `src/adapters/objectives.ts` est
    inchangé et aucun test de ce lot ne relit `checkDigest`. L'empreinte d'un
    contrat de graphe et le `checkDigest` d'un objectif sont deux espaces de noms
    distincts, et le test le prouve en montrant qu'aucun code du lot ne les
    rapproche.
12. **Le manifeste est intact.** Le test relit `.cuesheet-project/graph.json` et le
    compare octet à octet à `stateGraphJson(root)`, comme le test de manifeste
    livré le fait déjà.
13. **Voisins.** Les quatre fichiers de vérification voisins, `loadability`,
    `portability` dont PORT-05, et `tsc -p tsconfig.build.json` avec ses 32
    diagnostics inchangés.
14. **Non-vacuité par mutation.** Au moins quatre mutants nommés, avec le compte
    exact de tests en échec pour chacun.

## Preuves attendues

Un fichier `docs/harness/evaluation/state-graph-contracts/evidence.md`, de la même
forme que les trois preuves déjà livrées. Il doit notamment écrire noir sur blanc
que la moitié « un mock passe et le backend diverge » du critère est rendue par
SG05.3 et que la moitié « seed identique, résultats reproductibles » est rendue
par SG05.2. SG05.1 livre la règle et le refus, pas la preuve runtime.

## Hors périmètre

Une tranche bornée ne ferme pas son parent.

- **Génération de mocks et de fixtures.** SG05.2. SG05.1 ne génère rien. Il fixe
  les entrées dont la génération dépendra, le triplet empreinte de contrat, seed,
  version de générateur, sans le produire.
- **Tests consommateur, conformité du réel et détection de drift.** SG05.3. C'est
  la tâche qui produit le rapport de conformité d'implémentation réelle, donc le
  verdict `divergent` ne peut pas être rendu par SG05.1 seul.
- **Les objectifs.** `src/adapters/objectives.ts` garde son autorité, y compris
  `verifyObjective` et sa liaison de check épinglé. Aucune révision d'objectif,
  aucun `checkDigest`, aucune preuve existante n'est réinterprétée. La révision
  d'un contrat de graphe et la révision d'un objectif restent deux espaces de
  noms distincts tant que SG07 ne décide pas leur relation.
- **Le format du manifeste.** `schema.ts` n'est pas modifié, donc aucun corps de
  contrat n'entre dans le JSON commité, et le test le prouve par égalité octet à
  octet.
- **Le générateur.** `graph:regen` n'est pas requis et pas permis, aucun node et
  aucune edge n'étant ajoutés.
- **Les invariants.** Un verdict d'invariant reste SG03.2. La compatibilité
  structurelle ne garantit pas la compatibilité métier, donc un rapport de
  contrat vert ne promeut aucun invariant.
- **L'API.** `get_current_contract` et ses erreurs de révision périmée sont
  SG07.1. SG05.1 ne publie aucune opération et n'ouvre aucun transport.
- **Le critère.** AC-SG05 reste PENDING après SG05.1. Ses deux moitiés appartiennent
  à SG05.3 et SG05.2.
- **Le risque.** R-SG4 reste OPEN. SG05.1 écrit la règle qui rend la divergence
  détectable, il ne la rend pas détectée.

## Questions ouvertes

1. **Vocabulaire des expressions de type.** STATE-GRAPH.md exige un schéma borné et
   documenté et refuse toute expression non supportée, mais ne l'énonce nulle
   part. Le validateur doit implémenter un ensemble fermé et nommé, et le refus
   doit être la valeur par défaut tant que l'énumération n'est pas donnée : une
   expression hors ensemble est refusée, jamais approximée en chaîne. L'énumération
   elle-même est la décision manquante. Tant qu'elle manque, le validateur, le refus,
   le moteur de compatibilité et l'indépendance du mock restent livrables, seule
   l'énumération manque.
2. **Direction de la compatibilité.** Une valeur ajoutée à une énumération fermée
   casse-t-elle le producteur qui doit la produire, ou seulement le consommateur
   qui doit la gérer. STATE-GRAPH.md décide qu'une expression non supportée est
   refusée, ce qui tranche le consommateur, et ne dit rien du producteur. La règle
   6 ne couvre que le retrait d'un code d'erreur déclaré.
3. **Listes sémantiques.** `STATE-GRAPH.md` distingue l'ordre des listes
   sémantiques, conservé, de l'ordre non sémantique, trié. Le contrat ne dit pas
   quelles de ses listes sont sémantiques. Une liste d'exemples est probablement
   non sémantique, une liste d'opérations probablement sémantique. Ce n'est pas
   écrit.
4. **Définition d'un rapport de conformité réel.** SG05.1 décide que le rapport
   existe, qu'il ne vient pas d'un mock et que son verdict peut être `divergent`.
   Ce qui constitue une observation indépendante suffisante est la question de
   SG05.3, et elle décide de la force de la preuve, pas du verdict.
5. **Version du format de contrat.** Le manifeste porte une `revision` de node,
   entière et égale à 1 partout. Le format de contrat a sa propre version, et les
   deux ne sont pas posés comme reliées. Aucune source ne décide laquelle porte la
   règle de compatibilité, ni comment une révision de node et une version de
   contrat divergent.

# Ce qui reste ouvert après ce document

Rien ici ne ferme un critère. Ce qui devient possible : un worker peut implémenter
SG04.1 et SG05.1 sans inventer de règle, et un relecteur peut vérifier le résultat
contre des scénarios nommés. Ce qui reste à la décision du propriétaire : les
questions ouvertes de chaque section, en particulier le vocabulaire des
expressions de type, la direction de la compatibilité, la représentation de
`contextRevision` et l'identité de tâche dans le graphe.