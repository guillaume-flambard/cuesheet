# EV-STATE-GRAPH-MANIFEST

2026-10-02. SG01.3, manifeste initial Cuesheet. Premier manifeste réel, généré et
versionné, couvrant sessions, objectifs, workers et intégration.

## Contenu

69 noeuds, 77 arêtes, 41 fichiers sources distincts, tous réellement présents dans
le dépôt et vérifiés. Quatre domaines : `domain.sessions`, `domain.objectives`,
`domain.workers`, `domain.integration`. Types d'arêtes : `validates` 22,
`contains` 22, `depends_on` 12, `describes` 11, `implements` 10. Toutes les
révisions de noeud valent 1.

Aucun noeud `ci` : le dépôt ne déclare aucun job CI et aucun n'a été inventé. Un
test verrouille ce compte à zéro pour qu'un noeud inventé ne puisse pas s'y
glisser. Les arêtes `depends_on` n'existent que là où l'import a été ouvert et
confirmé dans le code, y compris deux arêtes transverses entre domaines.

## Preuves

4 tests ciblés PASS dans `test/state-graph-manifest.test.ts` : le manifeste
versionné est exactement ce que produit le générateur et le vrai loader
l'admet ; chaque source déclarée est un fichier réel sous la racine owner avec
son vrai SHA256 ; les quatre domaines nommés sont présents, peuplés et bornés ;
une référence absente, un id dupliqué, une version inconnue ou un chemin hors
racine sont refusés avant admission.

Déterminisme vérifié par deux processus `node` distincts : `cmp` propre, sha256
`2ce237cc77ef8d58210d4ba98841a695e33a213dfc76e88957ec0ec3bf43865b` pour les deux,
identique à l'artefact versionné. Même empreinte sous `TZ=UTC` et `TZ=Asia/Bangkok`
et sous `LANG=tr_TR.UTF-8`. Le vrai loader renvoie la révision
`fa08cae7732c3e78253f35de496e28edf63dc464d3056384a02aaf050c6d34bd`.

Non-vacuité des tests prouvée par mutation : constante en guise de digest, 2 échecs
; fichier déclaré inexistant, 4 échecs ; noeud `ci` inventé, 3 échecs ; ordre des
noeuds inversé au lieu d'un tri, 1 échec.

## Collision de nom réservé, découverte à l'intégration

Le premier commit plaçait le manifeste sous `.cuesheet/project/graph.json`, comme
l'écrivait alors la spec SG01.2. L'intégration a révélé que
`ContainerToolRunner` réserve ce même répertoire : `src/adapters/container-tools.ts`
lui monte par-dessus un répertoire vide et en lecture seule, pour qu'un outil
piloté par un modèle ne puisse jamais lire l'état de contrôle du runner. Le
manifeste était donc invisible depuis tout conteneur, et les 4 tests de manifeste
échouaient dans la preuve autonome par capsule, qui exécute la suite entière dans
le Linux capsule.

Reproduit isolément avant toute correction : dans le conteneur, `.cuesheet` existe
mais `graph.json` est absent. Décision.Porté le manifeste vers
`.cuesheet-project/graph.json`, en touches `loader.ts`, `manifest.ts`, les deux
fichiers de test, l'artefact versionné et STATE-GRAPH.md. Le masque du runner
n'est pas modifié : c'est un contrôle de sécurité délibéré, et faire une
exception à sa portée aurait été le mauvais côté à affaiblir. Le répertoire réservé et son
raison sont maintenant documentés dans le loader, pour que le même conflit ne
revienne pas.

## Limites

Le changement de chemin contredit la formulation d'origine de STATE-GRAPH.md
lignes 13 et 233, qui ont été mises à jour avec la raison. Le générateur est une
module commit mais aucun script ni hook npm n'a été ajouté, `scripts/**` et
`package.json` étant hors périmètre : la régénération se fait par appel direct, et
la dérive est tenue par le test qui compare l'artefact versionné à une
reconstruction fraîche.

Une mutation reste indétectable et n'est donc pas revendiquée comme attrapée :
remplacer le comparateur ordinal par `localeCompare` laisse les 4 tests verts,
parce que pour cet ensemble d'identifiants en ASCII bas l'ordre de collation et
l'ordre d'octets coïncident. Ce qui compte réellement, l'artefact identique entre
locales, est vérifié.

`ownerFile`, branche de traversal du générateur, est une défense en profondeur non
testée : aucun chemin déclaré ne peut l'atteindre sans écrire à la main une
déclaration invalide.

Aucun job CI n'est déclaré, ce qui laisse REQ-SG01 partiellement adressée sur ce
point et AC-SG01 vérifiée seulement sur son texte de critère, qui porte sur le
chargement et le refus avant effet.

SG01.3 DONE borné. AC-SG01 VERIFIED, ses trois tâches SG01.1, SG01.2 et SG01.3
étant livrées. Les épics SG02 et suivants restent ouverts.