# Relier les agents, les modèles et le cœur central

Recherche du 2026-10-03. Périmètre : logique de collaboration et lien avec les vues.
Complément de [AGENT-ASSIST-ROUTING.md](AGENT-ASSIST-ROUTING.md), pas preuve
d'implémentation. Le protocole projet, AGENTS.md et le master produit ont été lus.
Cette recherche ne modifie ni le runtime ni son statut de livraison.

## Décision proposée

Conserver les journaux et contrôleurs locaux de Cuesheet. Ajouter un protocole
commun d'assistance, un contrôleur de routage et des projections de connaissances.
Les vues lisent ces mêmes objets. Une conversation LLM ne devient jamais le cœur
central et le changement de modèle ne change jamais l'identité du travail.

Cette décision est une recommandation adaptée à Cuesheet. Les sources suivantes
documentent des mécanismes et des limites, elles ne démontrent pas que cette
architecture est déjà réalisée ou qu'elle gagnera un benchmark.

## Sources primaires et conclusions limitées

| Source | Ce qu'elle établit | Application proposée et limite |
|---|---|---|
| [LangGraph Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), documentation consultée le 03/10/2026 | Les checkpoints portent l'état d'un thread, les stores les données applicatives entre threads. Un MemorySaver en RAM ne survit pas au redémarrage. | Séparer reprise d'une exécution et savoir partagé World/Project. Le store ne garantit ni provenance ni vérité. L'ancienne URL durable-execution redirige désormais vers cette page. |
| [LangGraph Subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs), documentation consultée le 03/10/2026 | Un sous-graphe peut partager des clés d'état ou exposer une transformation explicite entre ses entrées/sorties et celles du parent. Cette dernière permet un historique privé. | Une capsule bornée entre dans un helper ; un résultat typé en sort. Ne pas partager toutes les conversations. Copier le contrat d'interface suffit, sans adopter LangGraph. |
| [LangGraph Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance), documentation consultée le 03/10/2026 | Retries, délais et gestion d'erreur sont distincts. Les retries sont configurables selon la cause. La page annonce `@langchain/langgraph >= 1.4.0` pour les délais et handlers par nœud. | Distinguer délai global et absence de progrès ; borner l'ensemble des tentatives. Annuler une écriture d'état du graphe ne prouve pas l'annulation d'un effet externe. Préserver les reçus d'effets de Cuesheet. |
| [A2A Specification](https://a2a-protocol.org/latest/specification/), documentation évolutive consultée le 03/10/2026 | Messages, tâches et artefacts sont des objets distincts. Le flux transmet changements de statut et artefacts. Le cycle de vie d'une tâche est indépendant de celui d'une connexion de streaming. | Reprendre cette distinction pour les objets locaux. Un statut distant terminé reste une déclaration du producteur, pas une validation des critères Cuesheet. Le chemin latest évolue ; figer la version lors d'une éventuelle intégration réseau. |
| [LiteLLM Router](https://docs.litellm.ai/docs/routing), documentation consultée le 03/10/2026 | Le router propose des stratégies de charge, limites, latence et coût, avec cooldown par déploiement et alternatives. | Séparer disponibilité d'une route et compétence sur une tâche. Une panne d'un endpoint ne condamne pas automatiquement toutes les routes du même modèle. Les valeurs de cooldown documentées ne sont pas une politique Cuesheet à copier. |
| [RouteLLM](https://arxiv.org/abs/2406.18665v4), v4 du 23/02/2025, première soumission 26/06/2024 | Les auteurs entraînent des routeurs sur préférences pour arbitrer entre deux modèles et évaluent des compromis qualité/coût sur leurs benchmarks. | Envisager un routeur appris seulement avec des exemples locaux étiquetés et une évaluation tenue à part. Le papier ne fournit pas le meilleur modèle pour chaque tâche Cuesheet ni une garantie de qualité pour une chaîne d'outils. |
| [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657v3), v3 du 26/10/2025 | La taxonomie MAST regroupe les défaillances étudiées en conception système, désalignement inter-agents et vérification des tâches. | Tester ces trois familles séparément. Ajouter des agents ne prouve pas une meilleure exécution. Les modèles et systèmes étudiés ne représentent pas automatiquement les routes actuelles de Cuesheet. |
| [Anthropic, How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), 13/06/2025 | Retour d'expérience sur un système de recherche : portée explicite des sous-tâches, instrumentation, coût de coordination et limitations des barrières synchrones. | Réserver la coopération à une incertitude ou un parallélisme utile. La recherche web indépendante se parallélise autrement que des changements de code couplés. Leurs gains internes ne prédisent pas ceux de Cuesheet. |

Les documents LangGraph, A2A et LiteLLM sont des pages maintenues, sans version
immuable collectée ici. Les contrats exacts devront être vérifiés contre une
version figée si une dépendance est ajoutée. Aucun chiffre de performance externe
n'est adopté comme critère de réussite local.

## Une logique commune, plusieurs projections

Flux recommandé :

```text
intention + révision
  -> travail identifié
  -> demande d'aide typée
  -> admission et choix du destinataire / modèle
  -> exécution isolée
  -> résultat et références de preuves
  -> publication centrale qualifiée
  -> deltas pertinents aux agents et à la vue humaine
```

Le contrôleur écrit un événement durable avant de publier sa notification.
L'enveloppe minimale relie `eventId`, `requestId`, `causationId`, `agentId`,
`taskId`, `objectiveRevision`, `scope`, `sourceRefs` et `schemaVersion`.
Un curseur par consommateur permet la reprise et la déduplication. La vue ne
conclut pas qu'une tâche est terminée parce qu'un flux a fermé.

| Objet central proposé | Ce que l'agent reçoit | Ce que l'humain voit |
|---|---|---|
| Demande d'aide | Question, résultat attendu, limites, sources accessibles | Qui aide qui, pour débloquer quoi |
| Décision de route | Route choisie, contraintes, motif et candidats exclus | Modèle effectif et raison courte, détail à la demande |
| Résultat d'aide | Constat qualifié, implications, inconnues et sources | Découverte qui change le travail, source ouvrable |
| Delta de connaissance | Changement pertinent, révision et invalidateurs | Ce qui vient de changer dans la compréhension commune |
| Reçu de validation | Critère vérifié, commande ou méthode, cible et révision | Ce qui est démontré et ce qui reste à vérifier |

Ce sont des projections des mêmes identités. Leur contenu est filtré selon les
droits et le besoin. Une vue d'inspection peut exposer plus de détail sans créer
une seconde mémoire. Les tokens de texte en cours peuvent rester éphémères ;
les décisions, résultats, effets et preuves nécessaires à la reprise sont durables.

## Routage : commencer avec des règles vérifiables

Proposition pour AR03/AR04 :

1. Filtrer les routes par autorisation, données accessibles, format, outils,
   contexte requis et contraintes humaines. Inconnu reste explicite.
2. Appliquer l'état récent de disponibilité au niveau route/déploiement et la
   pression collective du fournisseur. Un quota refusé ne devient pas un mauvais
   score de compétence au code.
3. Honorer un choix humain applicable ; sinon démarrer avec le défaut configuré
   et les préférences explicites. Tout changement a un motif consultable.
4. Utiliser les résultats vérifiés de tâches comparables, leur fraîcheur et leur
   nombre d'observations. Ne pas prétendre à une estimation fiable avec un seul essai.
5. Escalader après une cause identifiée, dans le budget commun. Reconstituer une
   capsule depuis l'état durable ; ne jamais rejouer automatiquement un effet incertain.

Enregistrer séparément : transport, quota/auth, format de réponse, validité
d'appel d'outil, exécution, puis satisfaction du critère. Un outil échoué peut
révéler un dépôt défectueux ou un contrat ambigu, pas une faiblesse du modèle.
Mesurer le temps jusqu'à un résultat vérifié et le coût total des reprises,
plutôt que la seule latence du premier token.

## Entraide universelle sans boucle incontrôlée

Tous les rôles appellent le même service `requestAssistance`. Le service cherche
un résultat frais réutilisable, puis un pair pertinent, puis admet un helper si
nécessaire. Chaque demande porte une échéance et une réserve du budget global.
Le rôle du demandeur ne lui donne pas de nouvelles permissions.

La file d'attente doit détecter les dépendances cycliques et libérer le slot de
calcul d'un agent qui attend. Une demande équivalente peut partager le même travail
d'aide si scopes, sources et révision correspondent. Une annulation ferme les
nouvelles admissions mais conserve les résultats déjà confirmés.

Pour nourrir le cœur, publier une connaissance avec auteur, sources, révision,
statut OBSERVED/INFERRED/ASSUMED/UNKNOWN et invalidateurs. Un avis reçu reste
INFERRED même si trois agents l'approuvent. Sa validation ajoute un reçu séparé.
Les découvertes périmées restent consultables historiquement mais cessent de
justifier les actions courantes. L'accès à un résumé ne doit jamais donner accès
implicitement à ses sources privées.

## Vérifications qui peuvent contredire la proposition

- Fermer puis rouvrir la vue pendant une aide : même demande, aucune nouvelle
  inférence déclenchée par le simple affichage.
- Corriger l'intention entre résultat et effet : résultat marqué périmé, aucune
  application sous l'ancienne révision.
- Recevoir deux fois un résultat : une seule publication et une seule dépense
  admise pour la demande coalescée, sans promettre l'exactly-once du fournisseur.
- A attend B qui attend A : cycle visible, budget conservé, terminal utilisable.
- Fournisseur refuse tous les agents : backpressure commune, aucune tempête
  de retries, brouillon et preuves conservés.
- Helper affirme que le code marche : statut d'avis reçu seulement ; les critères
  restent ouverts jusqu'à leurs validations.
- Redémarrer pendant un effet : reçu retrouvé ou effet incertain, jamais succès
  déduit de l'absence d'erreur.

Ces scénarios sont un plan proposé, pas des tests exécutés dans cette recherche.
Le parcours réel final doit relier demande d'aide, route choisie, découverte
centrale, consommation par un autre agent et preuve visible après redémarrage.

## Ce que cette recherche ne justifie pas

Pas de réécriture en Rust, de migration LangGraph, de service LiteLLM obligatoire,
de bus distribué ni d'intégration A2A réseau dans la première tranche. Ces outils
peuvent devenir des adaptateurs si un besoin mesuré les justifie. Le travail
prioritaire consiste à relier les mécanismes Cuesheet existants sous un contrat
commun et à démontrer leur continuité dans le vrai terminal.

Vérification documentaire : huit sources primaires ouvertes ; faits externes
séparés des recommandations ; aucune annonce d'implémentation ; liens entre
AR01 à AR07 conservés. Risques encore à résoudre à l'implémentation : effets
incertains, mélange de scopes, cycles, budgets et attribution trompeuse des
résultats au modèle. Aucun test runtime ni build requis pour ce seul document.
