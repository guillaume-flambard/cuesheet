# EV-STATE-GRAPH-IMPACT

2026-10-02. SG02.1, moteur d'impact déterministe sur le graphe d'état. Index
inversé, fermeture transitive itérative et composantes fortement connexes.

## Surface exportée

`buildReverseIndex`, `nodesForSourcePath`, `strongComponents`, `computeImpact`,
avec `DEFAULT_MAX_IMPACTED = 10000`. Un `ImpactPlan` porte `seeds`, `unresolved`,
`complete`, `impacted`, `cycles` et `maxImpacted`. Chaque noeud impacté porte son
`component`, son `inCycle`, son nombre de sauts et une `reason` qui nomme le
graine, le lien et le type d'arête parcouru.

## Preuves

11 tests ciblés PASS dans `test/state-graph-impact.test.ts`, plus les 6 de
régression déjà existants. Les sept cas exigés sont exercés : diamant, cycle,
dépendance supprimée, renommage, fichier non cartographié, limite de borne, et
déterminisme. S'y ajoutent l'immuabilité des structures retournées, la politique
d'arêtes, et une chaîne de 20000 niveaux qui résout sans épuiser la pile, ce qui
prouve que la fermeture n'est pas récursive.

Déterminisme établi par trois voies indépendantes. D'abord la réversion
requiert l'équivalence du plan : deux graphes dont l'ordre des noeuds, des
`sourceRefs` et des arêtes est inversé ont la même `graphRevision` et des plans
`JSON.stringify` identiques, ce qui est la revendication littérale d'AC-SG02. Puis
la répétition en processus, où l'ordre et les doublons des graines ne changent
rien. Enfin la comparaison entre processus, via un enfant `node` dont
l'environnement est assemblé par nommage, jamais par dérivation de
`process.env`. Le comparateur ordinal, l'absence d'horloge et l'absence
d'aléatoire, et le re-tri de toute liste qui atteint un appelant sont la
mécanique derrière ces trois observations.

Non-vacuité prouvée par mutation : le bogue réel de départ était un arbitrage de
témoin qui testait le signe d'une comparaison pour sa vérité, si bien qu'un
témoin moins bon écrasait un meilleur et que le diamant se résolvait par la
mauvaise branche. Le test du diamant l'a détecté.

## Choix explicites

Les cinq types d'arêtes participent à l'impact par défaut, parce que `schema.ts`
stocke chaque relation sous la même paire `dependent`/`dependency` : changer une
dépendance peut périmer le dépendant quelle que soit la relation. Un défaut plus
étroit répondrait « rien à faire » à un changement qui a manifestement invalidé un
check, un contrat ou un document, ce qui est l'impact vide trompeur que REQ-SG02
interdit. Le rétrécissement est donc une politique d'appelant, exposée en option
et jamais un défaut silencieux.

Ce choix a un coût assumé : `contains` propage vers le haut, donc une édition
feuille marque son agrégat comme impacté. C'est le moindre mal face à un impact
silencieusement vide.

La borne vaut 10000, soit le plafond du schéma plutôt qu'un nombre arbitraire :
une fermeture sur une entrée validée ne peut pas l'atteindre, donc le refus ne
peut se déclencher que sur une entrée qui a court-circuité la validation, le cas
hostile pour lequel elle existe. Le dépassement lève une erreur et ne rend aucun
plan partiel, conformément au style de la maison.

## Limites

Le plan ne porte pas de champ `revision`. L'y incorporate obligerait à appeler
`graphRevision`, qui fait repasser le graphe par `parseStateGraph`, une
re-validation que le contrat interdit, et coûterait un tri et une sérialisation
par appel. Le cache par révision appartient à SG02.3.

Une seule raison par noeud, et non une par couple noeud, graine : énumérer tous
les témoins est exponentiel sur un diamant. Le témoin canonique est le chemin le
plus court, puis la plus petite suite d'ids d'arêtes, puis le plus petit id de
graine.

Aucune correspondance diff vers graines : c'est SG02.2. `nodesForSourcePath` est
exposé comme couture et le moteur s'arrête là. Un fichier non cartographié se
distingue d'une graine réellement sans effet, parce qu'il atterrit dans
`unresolved` avec `complete: false`.

`complete: false` est un drapeau, pas une contrainte : rien en aval ne le
consulte encore. SG02.2 et SG02.3 ne doivent pas lire un `impacted` vide comme
« rien à faire ».

La chaîne de 20000 nœuds dépasse le plafond de 10000 du schéma et est construite
comme objet typé brut, ce qui est intentionnel : cela prouve que le moteur ne
revalide pas et ne récurse pas.

SG02.1 DONE borné. AC-SG02 reste PENDING à dessein : REQ-SG02 demande que chaque
changement produise la fermeture, et la correspondance diff vers graines, qui
est SG02.2, n'existe pas encore. Clore le critère d'épique sur la seule preuve de
SG02.1 serait une clôture de parent sur un enfant.