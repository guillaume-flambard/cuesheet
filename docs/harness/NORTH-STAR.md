# NORTH STAR

> **LA NORTH STAR N EST PAS LE BACKLOG.**
>
> Une idée présente ici n est pas autorisée à entrer dans le périmètre actif
> simplement parce qu elle fait partie de la vision. Son activation doit être
> justifiée par les dépendances, les preuves et l état du produit.
>
> Ce document existe pour qu une idée ne disparaisse pas avec la conversation qui
> l a produite. Il n existe pas pour la promouvoir en travail.

Ce fichier est le pendant narratif de `state.json`, tableau `concepts`, qui porte
le même contenu sous forme lisible par machine et gelée. Quand les deux
divergent, `state.json` fait foi sur ce qui est gelé ; ce document fait foi sur
le raisonnement, qui n a pas sa place dans un champ JSON.

## Ce que Cuesheet est

Un harnais d exécution persistant : il transforme une intention humaine évolutive
en changements vérifiés, en préservant le contexte, l état, les preuves, la
réversibilité, le contrôle humain et la continuité.

Il n est pas : un emballage de chat, un lanceur de prompts, une file autour d un
modèle, une démo de codage scriptée, une collection d agents déconnectés, une
interface qui cache des scripts shell, une peau d OpenCode.

Cela est déjà du corpus actif : `README.md` et `01-OBJECTIVES.md` à `11-SHARED-ORGANIZATION.md`.
Ce document ne le répète pas.

## L arbre

```text
Cuesheet
│
├── Compréhension de l intention
│   ├── conversation
│   ├── recherche
│   ├── plan
│   ├── construction
│   └── artefact
│
├── Contexte vivant
│   ├── aucune file de messages
│   ├── réinterprétation pendant l exécution
│   ├── invalidation sémantique
│   └── préservation du travail non affecté
│
├── Intelligence
│   ├── routage de modèle
│   ├── skills
│   ├── mémoire
│   ├── Think-for-Human
│   └── décisions fondées sur des preuves
│
├── Graphe d agents
│   ├── nombre de workers dynamique
│   ├── dépendances
│   ├── spécialisation
│   ├── état partagé
│   └── vérification indépendante
│
├── Ordonnanceur
│   ├── qualité
│   ├── latence
│   ├── coût en tokens
│   ├── coût monétaire
│   ├── RAM
│   ├── CPU
│   └── GPU
│
├── Exécution
│   ├── worktrees
│   ├── capsules
│   ├── récupération
│   ├── composition
│   └── vérification
│
└── Fabric de ressources
    ├── une seule machine
    ├── modèles locaux
    ├── GPU local
    ├── Macs de l équipe
    ├── ressources P2P
    └── GPU ou cloud distant
```

## Les branches, une par une

### Compréhension de l intention

Le harness décide lui-même si l interaction demande une conversation, une
exploration, une recherche web, un plan, une spécification, du travail de dépôt,
un artefact, une exécution, une vérification ou une décision humaine. La personne
ne choisit pas un mode pour du travail ordinaire. La génération d artefact ne
présuppose pas un dépôt : une intention peut produire un document sans qu un
projet soit nommé.

### Contexte vivant

Pas de file conceptuelle entre la personne et le harness. Une entrée qui arrive
pendant un travail rejoint le contexte partagé, est interprétée contre l état
d exécution courant, puis soit modifie, soit contraint, soit annule, soit
redirige, soit démarre un travail indépendant, soit informe. Seules les
hypothèses réellement changées sont invalidées. Cela est déjà prouvé par
Journey 003 pour le cas de la phrase qui atterrit pendant un run.

### Intelligence

Cuesheet possède le routage de modèle. La personne ne devrait pas avoir à choisir
un modèle par tâche. Les skills sont des paquets exécutables de capacité et de
contexte, pas de la décoration de prompt : découverts, versionnés, rafraîchis,
sélectionnés selon l intention. Le principe Think-for-Human précède toute
interruption : si une décision se résout par le dépôt, une spec, un test, une
preuve d exécution, de la documentation, une expérimentation réversible ou une
contrainte produit existante, la décision est prise et le travail continue.

### Graphe d agents

Le nombre d agents est une décision du scheduler, jamais une constante de
configuration. Les agents ne sont pas des chats indépendants : ils partagent
objectif, état de projet, contraintes, preuves, graphe de travail et décisions.
Un agent produit une contribution à l état partagé, pas un univers parallèle. Le
producteur d une modification n est pas l autorité sur sa correction.

### Ordonnanceur

La décision d allocation compose qualité, latence, coût en tokens, coût
monétaire, RAM, CPU et GPU. Le contexte déjà payé est une ressource. Le spawn
d un worker supplémentaire se décide sur le rendement marginal, pas sur un compte
cible. Un budget de temps et un budget de tokens font partie de l entrée de la
décision, pas de son résultat.

### Exécution

Isolation par worktree, exécution par capsule, récupération après crash,
composition puis vérification indépendante. Le candidat ne mute jamais le
stable. Un échec de vérificateur est une preuve conservée, pas un incident
effacé.

### Fabric de ressources

C est la branche la moins mature, et celle qu il est le plus facile de confondre
avec du travail. Deux ressources distinctes doivent rester distinctes : le
**calcul local** nécessaire au harness et aux agents (processus, builds, tests,
conteneurs, traitement de contexte) et l **inférence de modèle**. Ajouter de la
RAM chez un collègue ne donne pas plus de tokens d inférence si les modèles
restent distants ; cela déporte des workers, des builds, des tests, de
l indexation, des bacs à sable et des modèles locaux.

**Elastic Compute Mesh.** CPU, RAM, GPU, bacs à sable et capacités répartis
entre les machines autorisées. L escalade part toujours du moins coûteux et du
plus local :

```text
1. opération locale déterministe
2. machine courante
3. pairs de confiance sur le LAN
4. serveur d équipe
5. calcul cloud ou provider
```

Le GPU est un étage d escalade, pas la solution par défaut. Chaque machine
annonce une **enveloppe de ressource** avec une politique, jamais un accès
anarchique :

```yaml
peer:
  available:
    cpu: 3
    memory: 8GB
    workers: 4
  capabilities: [node, docker, swift, xcode]
  gpu: { available: false }
  policy:
    max_memory: 8GB
    max_cpu: 35%
    idle_only: true
```

Si la personne qui utilise la machine reprend de l activité, la pression est
détectée et le travail se déplace. L emplacement d exécution devient une
décision du même scheduler que le modèle, le contexte et le nombre d agents.

**Compute follows data.** La propriété de sécurité, distincte de
l ordonnancement : le worker va vers le calcul autorisé, jamais la donnée vers un
calcul arbitraire. Ce qui revient est un constat, une preuve, un digest, un
verdict, sans rapatrier la donnée sensible.

**Team Computer.** L équipe vue comme un ordinateur unique : coeurs, RAM, GPU et
capacités agrégés, sur lesquels l Elastic Workforce se déploie. C est une
direction, pas un prérequis. Rendre l emplacement d exécution interchangeable
entre local et pair est le chemin naturel, et il vient après que l Elastic
Workforce locale fonctionne réellement.

## Dear future reader

Ce document est versionné dans Git, donc il survit aux conversations. Si dans six
mois une décision de feuille de route change entièrement, cette vision reste
intacte et lisible sans devoir retrouver une discussion.

La règle du haut est la seule qui compte pour savoir quoi faire de ce fichier :
rien ici n est du travail tant que les dépendances, les preuves et l état du
produit ne l ont pas justifié. Ajouter une idée à ce fichier est un acte de
mémoire, pas un engagement.
