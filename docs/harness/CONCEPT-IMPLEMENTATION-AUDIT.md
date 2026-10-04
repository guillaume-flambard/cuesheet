# État d'implémentation par concept

Audit du 2026-10-03 : lecture du code, state.json et preuves historiques.
Aucune nouvelle suite exécutée pour cet audit. Une preuve citée décrit son lot,
pas l'acceptation du produit entier. Les prototypes Open Design sont exclus des
capacités livrées. Les tâches parentes TODO peuvent avoir des sous-tâches DONE.

## Collaboration et entraide

Consultations : `consult_agents` lance 1 à 3 consultations parallèles, avec rôles,
modèles configurables, contexte commun et résultats sourcés. Elles ne peuvent
pas exécuter leurs outils proposés. Preuve : evaluation/agent-consultation/evidence.md.

Code : `run_code_workers` admet 1 à 2 unités indépendantes, prépare des worktrees,
exécute des boucles privées bornées puis publie leurs contributions. Le contrôleur
est le seul écrivain du journal commun. L'intégration compose les deltas sous
check propriétaire ; un worker ne ferme pas son propre objectif. Deux vrais
modèles Go ont été exercés par API du contrôleur sur le paquet installé, pas comme
preuve d'une coordination autonome complète du terminal. Voir TWO-REAL-WORKERS.md.

Entretien autonome : H06.8 reste TODO. Un worker ne dispose pas d'un protocole
help-request avec blocage, admission d'un helper et routage de son résultat.
`code-worker-loop.ts` interdit notamment consult_agents aux workers de code.
Le contexte commun existe ; le routage automatique des découvertes utiles vers
chaque pair reste absent comme mécanisme complet.

Peer-to-peer : NORTH-STAR.md section 34 décrit des machines de confiance qui
annoncent des ressources bornées pour placer des workers. Le concept
elastic-compute-mesh est FROZEN dans state.json. Aucun resource mesh livré.
Ce P2P de machines est distinct de l'entraide des agents ; celle-ci est prévue
via état structuré commun, pas via chats privés directs.

## Matrice des 44 concepts du master

Partiel = briques présentes mais contrat complet non démontré.
Spécifié = direction/spec disponible, sans moteur complet raccordé.

| # | Concept | État observé | Limite / travail restant |
| --- | --- | --- | --- |
| 01 | Living runtime | Partiel | Sessions, effets, preuves, workers présents ; synchronisation complète intention/réalité/humain absente. |
| 02 | World > Project > Session | Partiel | Binding, Vault, contexte et reprise existent ; scope/session restent structurants, parcours continu multi-projets non accepté. |
| 03 | Zero modes | Présent dans l'entrée | Langage naturel sans sélecteur requis ; autonomie et ergonomie complètes encore ouvertes. |
| 04 | World awareness | Partiel | Registres, Git, docs, Vault et capacités ; Project Map universelle PM01..05 TODO. |
| 05 | Intent | Partiel | Objectifs/révisions/critères durables ; modèle enrichi Intent IR01 TODO. |
| 06 | Intent graph | Spécifié | Graphe technique initial ; chaîne intent→outcome IR02 TODO. |
| 07 | Intent drift | Partiel | Guards de révision/scope/source ; réconciliation sémantique IR04 TODO. |
| 08 | Intent compiler | Spécifié | Organisation/specs proposées disponibles ; compilateur complet absent. |
| 09 | Feasibility engine | Spécifié | Refus déterministes locaux ; moteur sourcé IR03 TODO. |
| 10 | Reality/state graph | Partiel | Schéma, loader, manifeste, index ; graphe universel et raccord complet absents. |
| 11 | Impact engine | Partiel | Fermeture/index/cycles et mapping de changements ; plan de checks/CI SG02.3, SG08 ouverts. |
| 12 | Counterfactual graph | Vision future | Aucun parcours complet de simulation sans modification démontré. |
| 13 | Epistemic runtime | Partiel | Propositions, observations et checks distincts ; classification générale de chaque claim non livrée. |
| 14 | Knowledge half-life | Partiel | Digests/currentness et refus stale ; invalidateurs/fraîcheur de toutes connaissances non livrés. |
| 15 | Shared engineering state | Présent, borné | Journaux/projections/mémoire partagés ; modèle complet et distribution équipe restent ouverts. |
| 16 | Context capsule | Partiel | Frames bornés, capsules/outils scoped ; sous-graphe sémantique SG06 TODO. |
| 17 | Context expansion | Partiel | Lecture ciblée historique/Vault/sources ; expansion automatique du graphe TODO. |
| 18 | Context market | Spécifié | Pas d'arbitrage mesuré gain d'information/coût/fraîcheur raccordé. |
| 19 | Adaptive execution loop | Partiel | Observation/action/check/reprise ; boucle AE01..05 complète TODO. |
| 20 | Progressive discovery | Partiel | Inventaire Git/capacités et lecture ciblée ; probe universelle PM01..05 TODO. |
| 21 | Model ≠ agent | Partiel avancé | IDs/rôles/routes séparés ; migration dynamique générale H07.6 TODO. |
| 22 | Resilient model fabric | Partiel | Catalogues et choix Go/Zen, routes par rôle ; fallback compatible après quota non automatique. |
| 23 | Failure classification | Partiel | Diagnostics provider sûrs et effets incertains ; matrice complète/récupération H07.7 TODO. |
| 24 | Global backpressure | Spécifié | H07.8 TODO ; pas de circuit breaker collectif démontré. |
| 25 | Adaptive model routing | Partiel | Sélection/configuration par rôle ; routing coût/risque/capacité AE03 TODO. |
| 26 | Time resource | Partiel | Limites de tranches/inférences ; réserve de vérification/priorisation AE02 TODO. |
| 27 | Budget controller | Partiel | Usage natif et limites locales ; budget cumulatif multi-ressources AE01/H05.5 ouverts. |
| 28 | Work graph | Partiel | Organisation/tâches et graphe technique ; transitions dynamiques/claims H06.6 TODO. |
| 29 | Elastic workforce | Spécifié | Lots bornés 1–3 consultants / 1–2 code workers ; scheduler élastique H06.7 TODO. |
| 30 | Work stealing | Spécifié | Aucun pool chaud réaffectant continuellement les workers démontré. |
| 31 | Agent assist | Spécifié | H06.8 TODO ; pas de help-request→helper→finding opérationnel. |
| 32 | Knowledge delta routing | Partiel | État commun et résultats sourcés ; routage pertinent automatique H06.8 TODO. |
| 33 | Peer/adversarial review | Partiel | Rôle review via consultations et check indépendant ; sélection systémique proportionnée au risque absente. |
| 34 | Live steering | Présent, borné | Directives immédiates et refus stale ; réévaluation sélective de toute équipe/rebase H06.4 parent ouvert. |
| 35 | Sync barrier | Spécifié | Abort/arrêt existants ; stop claims→checkpoints→Team Sync H06.9 TODO. |
| 36 | Human legibility | Partiel | Vues/notifications sourcées ; HL01..04 TODO et design rejeté. |
| 37 | Human delta | Spécifié | Notifications ≠ delta sémantique ; HL03 TODO. |
| 38 | Confirmation exception | Partiel | Autorité/checks/refus ; politique niveaux 0..3 systémique HL02 TODO. |
| 39 | Human model | Spécifié | Aucun registre complet de communicated facts/last sync ; HL01 TODO. |
| 40 | Teach back | Spécifié | Pas de mécanisme déclenché par importance et vérifié ; réponse modèle possible ≠ feature. |
| 41 | Proof before done | Présent, borné | Finish/check owner indépendants refusent claims/effets incertains ; validation de tous types d'intent reste ouverte. |
| 42 | Proof-carrying work | Partiel | Receipts, captures, intégration sourcée ; enveloppe générale intent/change/impact/evidence/verdict non livrée. |
| 43 | UI proof | Partiel | Tests Ink/PTY et preuves installées ; rendu/usabilité natifs et nouveau design non acceptés. |
| 44 | Render proof | Source incomplète | Tests de rendu existent ; source maître coupée à CHANGE, procédure restante inconnue. |

## Sources inspectées

- state.json : tâches H03/H05/H06/H07/H08, SG, IR, PM, AE, HL ; concepts FROZEN.
- 06-AGENTS.md, NORTH-STAR.md, TWO-REAL-WORKERS.md.
- evaluation/agent-consultation/evidence.md et code-worker-recovery/evidence.md.
- src/adapters/terminal-code-workers.ts, code-worker-loop.ts, shared-context.ts,
  model-catalog.ts, state-graph/impact.ts ; apps/terminal/src/producer/index.ts.
- src/work-worker.ts : coordination par projection, sans canal privé vers un pair.

Les anciennes phrases TODO dans les specs parentes ne suffisent pas à nier les
tranches déjà implémentées. Inversement, leurs sous-tâches DONE ne ferment pas
les contrats parents. Aucun pourcentage global fiable n'est déduit du nombre de
tests ou de fichiers. Statut produit global : IMPLEMENTING.
