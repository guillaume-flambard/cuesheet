# H06 : agents temporaires et objectifs communs

## Résultat

Le harness délègue lorsqu'une séparation utile existe, avec tous les workers
reliés au même état de travail. Un remplacement d'agent conserve décisions,
preuves et questions. L'utilisateur n'organise pas les rôles et les messages.

## Admission et responsabilité

Une délégation porte worker ID, objectif et révision, unité de travail, résultat
attendu, scope de lecture/écriture, capacités et budget. Les rôles peuvent être
recherche, construction, revue ou contrôle ; ils sont choisis selon le besoin,
pas instanciés systématiquement. Un worker n'acquiert pas l'autorité de valider
sa production par son rôle ou son nom.

Réutiliser `temporaryWorker`, `worker-launcher`, les receipts et le store durable.
Le journal est la communication commune : les résultats sont publiés en records
sourcés. Une conversation privée n'est pas le seul endroit où vit une décision.
La demande humaine modifie immédiatement l'état commun, sans attente derrière
une file d'exécutions devenues obsolètes.

## Écriture et concurrence

Le terminal actuel possède une claim exclusive. Choisir et documenter la première
architecture réelle : contrôleur seul écrivain avec workers produisant des receipts,
ou transactions conditionnelles du store durable. Recommandation initiale : un
contrôleur seul écrivain, afin de conserver les garanties du journal terminal.
Les workers ne partagent pas naïvement des EventStore en mémoire.

Avant admission d'une sortie, vérifier la révision de travail utilisée, les
modifications pertinentes, le scope et les sources. Un résultat devenu obsolète
peut être conservé comme artefact historique sans engager le contrat courant.
Relecture et redérivation traitent les conflits. Une révision artificiellement
mise à jour sur un résultat ancien ne constitue pas un rebase.

Par défaut isoler les écritures de code concurrentes dans des workspaces distincts.
Associer base Git, patch ou capture au receipt. Intégrer explicitement et vérifier
le résultat composé. La partition d'un espace commun demande une démonstration
de non-conflit. Les worktrees créés par le harness sont suivis et nettoyables.

## Vie des workers

Enregistrer admission, début, observation, terminaison, disparition et résultat
incertain. Un heartbeat établit la vie d'un processus, pas la progression de son
objectif. Annuler les workers incompatibles avec une correction. Remplacer un
worker disparu depuis la projection commune, après reconciliation de ses effets.
La reprise transmet décisions et références utiles, pas toute sa conversation.

## Équipe élastique : graphe, pool, scheduler, contrôle

Quatre concepts. LE GRAPHE DE TRAVAIL dit ce qu'il reste réellement à accomplir.
LE POOL DE WORKERS dit quelles capacités sont disponibles maintenant. LE SCHEDULER
ADAPTATIF décide qui fait quoi maintenant. LE CONTRÔLE TEMPS RÉEL permet à la
personne de changer priorité, contexte ou portée, ou d'arrêter à tout instant.

Le nombre de workers n'est jamais une constante de configuration. C'est le résultat
d'une décision de scheduler recalculée à chaque cycle. Un worker peut être créé pour
une question pendant quarante secondes puis disparaître.

### États d'une unité de travail

`UNKNOWN → DISCOVERED → READY → CLAIMED → RUNNING → VERIFYING → PROVEN`, plus
`BLOCKED`, `STALE`, `SUPERSEDED` et `CANCELLED`. Une unité n'atteint `PROVEN` qu'avec
une preuve. En passant à `PROVEN`, elle libère les unités devenues `READY`. Elle
n'interroge pas l'orchestrateur pour savoir quoi faire ensuite : elle annonce son
état et le scheduler regarde le front disponible.

### Réclamation par capacité, pas par file

Le scheduler ne fait pas FIFO. Pour chaque unité admissible il compose : adéquation
des capacités du worker, contexte tiède déjà payé, priorité, chemin critique, temps
resté, latence attendue, risque de conflit et coût du modèle. Un contexte déjà payé
est une ressource, pas un déchet. Aucune de ces dimensions ne prétend à une précision
scientifique ; toutes doivent gouverner la décision.

### Rendement marginal du spawn

Un worker ne se crée pas lui-même : il demande une capacité supplémentaire. Le
scheduler compare le temps gagné, la probabilité d'un résultat utile et la pertinence
du chemin critique, contre le coût tokens, le coût monétaire, CPU et mémoire, le coût
de réconciliation et la probabilité de conflit. Douze migrations indépendantes valent
douze workers bon marché ; une seule fonction à implémenter en vaut un ; une décision
d'architecture difficile en vaut trois suivis d'une synthèse.

### Aide et constats par état partagé

Un worker émet une demande d'aide ou un constat structuré, jamais une conversation
privée adressée à un autre worker. L'état partagé le route vers le worker concerné,
qui ne reçoit que le delta pertinent, pas la conversation de l'émetteur. La mémoire
commune est le journal, pas une file de messages entre agents. Un worker qui découvre
une information utile à un pair publie le constat avec ses destinataires potentiels ;
le graphe fait le routage.

### Revues proportionnées

Une modification triviale va de l'implémentation au test. Une migration critique
déclenche plusieurs revues indépendantes puis une synthèse. La revue adversariale,
« suppose que cette solution est mauvaise », n'est lancée que lorsque le risque,
l'incertitude et l'impact la justifient.

### Découpage sous approbation

Un worker peut proposer une décomposition de sa propre unité, mais il ne spawn pas.
Le scheduler approuve ou refuse en connaissant CPU, mémoire, concurrence API, limites
de débit, budget tokens, budget monétaire, temps resté, workers existants,
investigations en doublon et chemin critique. Aucune explosion de workers ne peut se
produire par multiplication récursive.

### Baux de portée

Le scheduler attribue un bail sur des fichiers, pas un verrou sur tout le dépôt.
Un worker qui découvre qu'il doit toucher à un fichier pris par un autre publie un
conflit. Le scheduler choisit la solution la moins coûteuse entre transmettre le
constat au détenteur, attendre, transférer la propriété ou replanifier.

### Contrôle temps réel

Trois commandes. « Arrête après le travail en cours » : plus aucune unité n'est
attribuée, les workers finissent ce qu'ils ont, puis l'équipe fait le point.
« Arrête maintenant » : les workers posent un checkpoint, plus aucune écriture
n'est permise, les outils en cours sont annulés là où c'est sûr, puis
réconciliation. « Faisons le point » : barrière de synchronisation, aucune nouvelle
réclamation, attente des checkpoints sûrs, puis un état d'équipe avec avancement,
preuves produites, travail en cours, blocages, changements importants, chemin
critique restant et décisions requises. Une demande humaine modifie le graphe en
direct : priorité, contrainte ou portée changées, les travaux actifs sont réévalués,
ceux qui ne sont plus compatibles s'arrêtent à un point sûr, les autres continuent.
Le message humain n'entre jamais dans une file d'exécutions devenues obsolètes.

### Nombre de workers

Aucune limite arbitraire n'est posée, mais aucune liberté non bornée n'est donnée :
la forme de l'équipe change au cours d'une même mission, selon le découpage du
travail. Une phase de découverte a la forme d'un éventail, une phase de résolution
a la forme d'hypothèses concurrentes suivies d'une synthèse, une phase de vérification
a la forme de revues parallèles. Le scheduler peut réutiliser, créer, tuer, changer
de modèle, agrandir ou réduire un contexte, réclamer une autre unité, attendre une
dépendance, aider un worker sur le chemin critique, vérifier un travail achevé, ou
s'arrêter parce que la preuve exigée existe.

### Invariants de l'équipe élastique

1. Aucune limite arbitraire d'agents. Le parallélisme est borné par le travail utile,
   les ressources, le coût et le surcoût de réconciliation, jamais par un compte
   statique dans un fichier de configuration.
2. Les agents collaborent par connaissance structurée partagée, jamais par contexte
   conversationnel dupliqué.
3. Une capacité inoccupée est redirigée en continu vers du travail admissible qui
   raccourcit le chemin critique ou augmente la preuve exigée. Le travail admissible
   vient d'une intention ou d'une spec acceptée, d'une unité découverte en exécution
   puis admise dans le graphe, du travail de preuve, ou d'une exploration
   explicitement bornée. Un worker inoccupé ne s'invente jamais de boulot.
4. Aucun worker capable n'attend alors qu'existe un travail utile, admissible et sans
   conflit, sauf si la personne a demandé une barrière de synchronisation.

## Acceptation et tâches

- [ ] H06.1 Contrat de délégation et choix automatique de rôles utiles.
- [ ] H06.2 Deux vrais processus sur un état commun avec admission conditionnelle.
- [ ] H06.3 Isolation, intégration des artefacts et validation du résultat composé.
- [ ] H06.4 Correction humaine, rebase, arrêt et remplacement après crash.
- [ ] H06.5 Affichage des responsabilités et consommation cumulée.

Tests : deux workers vrais, sorties concurrentes, correction à R+1, receipt fondé
sur R refusé, travail compatible redérivé, worker tué après écriture avant receipt,
intégration conflictuelle, arrêt de tous les workers, lecture commune d'une décision
sans message privé, remplacement par un autre modèle. Un test seulement intercalé
dans un processus ne valide pas la concurrence réelle.

Dépendances : H01, H03, H05, H09. Lire `docs/SW-01-shared-work-state.md` pour
les garanties existantes et leurs limites ; ne pas annoncer qu'elles prouvent déjà
le runtime multi-processus terminal.

Gestion Git affinée : [AGENT-GIT.md](AGENT-GIT.md), H06.3a → b → c → d, TODO. Aucun worktree pour consultation ; isolation des écritures, intégration vérifiée, récupération et coût mesuré. Runtime encore à implémenter.
