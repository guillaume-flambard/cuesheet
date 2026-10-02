# Chantiers restants et délégation OpenCode

Photographie du 2026-10-02, référence `b8d86cf` : **90 tâches ouvertes**, 57 P0 et 33 P1, dans sept chantiers. Le produit reste IMPLEMENTING. Aucun P2/P3 n’est présent dans state.json ; cela ne signifie pas que toutes les idées futures sont obligatoires.

Copier le [prompt maître](prompts/ORCHESTRATOR.md) dans l’orchestrateur OpenCode. Il délègue ensuite les paquets aux prompts C1–C7 ci-dessous. La livraison de ce dossier ne ferme aucune tâche d’implémentation.

## Existant à préserver

Les sessions/journaux durables, corrections directes, choix providers/modèles, mémoire sourcée, skills par rôle, deux boucles workers privées, outils containers privés et composition vérifiée de contributions existent déjà. Les parents ouverts demandent encore des intégrations, migrations, cas de panne ou preuves complètes. Le state graph dispose du schéma et loader versionnés ; impact, manifeste du produit, MCP et CI restent à construire. Consulter les preuves avant de coder.

## Ordre et responsabilités

1. Audit du delta et des dépendances de chaque tâche ; préparer critères, risques et paquets bornés.
2. Fronts disjoints après audit : manifeste/impact C7 ; recovery/worktrees C4+C5 ; audit terminal C6. L’orchestrateur conserve le raccord producer/runtime et les documents canoniques.
3. Contrats et événements C1+C7, autonomie/mémoire C2, recherche/contexte/grants/skills C3, puis bindings runtime. Les tâches s’exécutent selon leurs dépendances exactes, avec tranches documentées si un parent global est encore ouvert.
4. Contrats/mocks, API/MCP, CI et UI impact C7 ; streaming/capacités/provider et workflow Git C5 ; sync partagée C3 ; notifications/packaging C6.
5. Vérificateur indépendant, panne/reprise/correction/substitution, benchmarks et développement réel de Cuesheet dans Cuesheet. Acceptation manuelle uniquement après les gates automatisées.

Un worktree par sous-agent ; aucun fichier partagé édité en parallèle. L’orchestrateur intègre, vérifie la composition et met à jour state.json. Le nombre de sous-agents dépend des capacités d’OpenCode et du quota disponible. Cette documentation ne lance aucun sous-agent.

## Contrat de paquet et vérificateur

Chaque paquet contient TASK, WHY, REQUIREMENTS, ACCEPTANCE, ALLOWED SCOPE, DEPENDENCIES, CONTEXT REVISION, BUDGET, VERIFICATION et EXPECTED EVIDENCE. Ces données viennent de l’état et des specs ; le prompt de rôle seul ne remplace pas ce paquet.

Prompt du vérificateur : « Lis indépendamment les critères du paquet et les instructions projet. Cherche les raisons pour lesquelles la contribution est incomplète : chemins non raccordés, effets obsolètes, races, crash, migration, permissions, dérive des contrats, coûts/latences et UX. Inspecte le diff et exécute les vérifications nécessaires sur la composition. Retourne violations avec fichiers/preuves/reproduction et critères non couverts. Ne modifie pas state.json et ne confirme pas un succès sur la seule déclaration de l’implémenteur. »

## Couverture produit à vérifier dans les specs

- Auto-apprentissage et « goût » : C2/C3/C6, essais mesurés de skills, critères design et critique indépendante, promotion/rollback ; pas une promesse d’égalité entre modèles.
- MCP/plugins : C4/C3/C7, registre capacités/autorisations, révocation, versions, isolation, diagnostics et recovery. Si le lifecycle plugin générique manque aux critères existants, le spécifier et créer des TODO finis avant son implémentation.
- Entreprise/Vault : C3, scopes explicites, permissions avant recherche et lecture, conflits offline et reconstruction de l’index.
- Situation : conserver heure/date/langue, personne et position de chaque agent à chaque inférence ; mesurer la taille plutôt que dupliquer tout l’historique.
- Git : C5, attribution et receipts, reprise après crash, intégration sérialisée, nettoyage récupérable.
- Notifications : C6, sources, déduplication et préférences ; distinguer livraison locale existante des transports externes non validés.

Ces liens explicitent la roadmap ; ils ne créent pas une nouvelle autorisation ni ne ferment les critères.

## Inventaire exhaustif des tâches ouvertes

Les dépendances ci-dessous sont celles de state.json, y compris les parents encore ouverts. Les critères et exigences associés sont indiqués pour construire les paquets. Les IDs DONE sont volontairement exclus de cet inventaire : leurs preuves doivent être consultées pendant l’audit.

### C1 — Contrats et plans durables (8)

[Prompt du sous-agent](prompts/C1.md).

- **H01.1** — P0, IN_PROGRESS : Schémas versionnés, IDs stables, projections et dépendances.
  Exigences : REQ-H01.1 ; critères : AC-H01.1 ; dépendances : B00.1, B00.2, B00.3, B00.4.
- **H01.2** — P0, IN_PROGRESS : Extraction et correction d'objectif en conversation ordinaire.
  Exigences : REQ-H01.2 ; critères : AC-H01.2 ; dépendances : B00.1, B00.2, B00.3, B00.4.
- **H01.3** — P0, IN_PROGRESS : Critères avec provenance, révision et autorité explicites.
  Exigences : REQ-H01.3 ; critères : AC-H01.3 ; dépendances : B00.1, B00.2, B00.3, B00.4.
- **H01.4** — P0, IN_PROGRESS : Raccordement plans/tâches/mémoire/preuves au contrat courant.
  Exigences : REQ-H01.4 ; critères : AC-H01.4 ; dépendances : B00.1, B00.2, B00.3, B00.4.
- **H01.5** — P0, IN_PROGRESS : Compatibilité des goals/plans déjà enregistrés.
  Exigences : REQ-H01.5 ; critères : AC-H01.5 ; dépendances : B00.1, B00.2, B00.3, B00.4.
- **H02.1** — P0, TODO : Décision structurée avec base de révision et admission runtime.
  Exigences : REQ-H02.1 ; critères : AC-H02.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.
- **H02.2** — P0, IN_PROGRESS : Specs utiles et tâches identifiables, versionnées, consultables/exportables.
  Exigences : REQ-H02.2 ; critères : AC-H02.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.
- **H09.1** — P1, IN_PROGRESS : Validation des payloads, migration et replay des anciennes sessions.
  Exigences : REQ-H09.1 ; critères : AC-H09.1 ; dépendances : B00.1, B00.2, B00.3, B00.4.

### C2 — Décisions et mémoire automatiques (5)

[Prompt du sous-agent](prompts/C2.md).

- **H02.3** — P0, TODO : Processus léger et questions seulement quand nécessaires.
  Exigences : REQ-H02.3 ; critères : AC-H02.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.
- **H02.4** — P0, TODO : Révision du plan à partir des échecs observés et revue appropriée.
  Exigences : REQ-H02.4 ; critères : AC-H02.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.
- **H02.5** — P0, TODO : Choix du processus évalués avec des providers réels.
  Exigences : REQ-H02.5 ; critères : AC-H02.5 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H03.1** — P0, IN_PROGRESS : Extraction mémoire sourcée/idempotente après échanges et observations.
  Exigences : REQ-H03.1 ; critères : AC-H03.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.
- **H03.2** — P0, TODO : Contradictions, réponses et leçons avec historique.
  Exigences : REQ-H03.2 ; critères : AC-H03.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1.

### C3 — Contexte, recherche et skills (12)

[Prompt du sous-agent](prompts/C3.md).

- **H03.3** — P0, IN_PROGRESS : Compilateur borné et lecture ciblée des sources omises.
  Exigences : REQ-H03.3 ; critères : AC-H03.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2.
- **H03.4** — P0, TODO : Reconstructions et isolation session/projet/personnel.
  Exigences : REQ-H03.4 ; critères : AC-H03.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2.
- **H03.5** — P0, TODO : Journal long, petite fenêtre et substitution de modèles mesurés.
  Exigences : REQ-H03.5 ; critères : AC-H03.5 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2.
- **H04.1** — P0, IN_PROGRESS : Choisir/raccorder le connecteur de recherche et sa configuration explicite.
  Exigences : REQ-H04.1 ; critères : AC-H04.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **H04.2** — P0, IN_PROGRESS : Lecture locale/web, résultat durable, limites et cancellation.
  Exigences : REQ-H04.2 ; critères : AC-H04.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **H04.3** — P0, IN_PROGRESS : Attribution, fraîcheur/version et citations effectivement obtenues.
  Exigences : REQ-H04.3 ; critères : AC-H04.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **H04.4** — P0, IN_PROGRESS : Découverte des skills configurés et chargement à la demande.
  Exigences : REQ-H04.4 ; critères : AC-H04.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **H04.5** — P0, TODO : Skill local essayé, révisé, réutilisé et promouvable avec preuves.
  Exigences : REQ-H04.5 ; critères : AC-H04.5 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **E01.3** — P1, TODO : Synchronisation réseau multi-machine, auth/permissions et conflits hors ligne.
  Exigences : REQ-E01.3 ; critères : AC-E01.3 ; dépendances : E01.1.
- **E01.5b** — P0, TODO : Retrieval automatique et invalidation au runtime
  Exigences : REQ-E01.5 ; critères : AC-E01.5 ; dépendances : E01.5a, E01.6.
- **E01.6** — P0, TODO : Grants séparés et révocation avant recherche/lecture
  Exigences : REQ-E01.6 ; critères : AC-E01.6 ; dépendances : E01.2.
- **E01.7** — P1, TODO : Évaluation retrieval sur corpus et panne index
  Exigences : REQ-E01.7 ; critères : AC-E01.7 ; dépendances : E01.5b.

### C4 — Continuité et récupération (7)

[Prompt du sous-agent](prompts/C4.md).

- **H05.1** — P0, IN_PROGRESS : Cycle de vie run/tranche/inférence distinct de l'objectif.
  Exigences : REQ-H05.1 ; critères : AC-H05.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3.
- **H05.2** — P0, IN_PROGRESS : Continuation bornée entre tranches actives.
  Exigences : REQ-H05.2 ; critères : AC-H05.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3.
- **H05.3** — P0, IN_PROGRESS : Reconstruction à la limite et détection de stagnation.
  Exigences : REQ-H05.3 ; critères : AC-H05.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3.
- **H05.4** — P0, IN_PROGRESS : Inspecter/reconcilier avant de répéter un effet incertain.
  Exigences : REQ-H05.4 ; critères : AC-H05.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3.
- **H05.5** — P0, TODO : Budgets cumulés, arrêt propagé, reprise au lancement explicitement configurable.
  Exigences : REQ-H05.5 ; critères : AC-H05.5 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3.
- **H09.2** — P1, TODO : Recovery explicite et reconciliation core/vue/artefacts.
  Exigences : REQ-H09.2 ; critères : AC-H09.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.
- **H09.3** — P1, TODO : Contrats d'outils et résultats complets référencés.
  Exigences : REQ-H09.3 ; critères : AC-H09.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5.

### C5 — Agents et modèles (18)

[Prompt du sous-agent](prompts/C5.md).

- **H06.1** — P0, TODO : Contrats de délégation et choix automatique des rôles.
  Exigences : REQ-H06.1 ; critères : AC-H06.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H06.2** — P0, TODO : Contrôleur et deux workers processus réels avec receipts/revisions.
  Exigences : REQ-H06.2 ; critères : AC-H06.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H06.3** — P0, TODO : Workspaces isolés et intégration explicitement vérifiée.
  Exigences : REQ-H06.3 ; critères : AC-H06.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H06.4** — P0, TODO : Correction à R+1, rebase et remplacement après disparition.
  Exigences : REQ-H06.4 ; critères : AC-H06.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H06.5** — P0, TODO : Responsabilités et budgets partagés exposés aux projections.
  Exigences : REQ-H06.5 ; critères : AC-H06.5 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H07.1** — P1, IN_PROGRESS : Anthropic direct, contrats et essai d'intégration configuré.
  Exigences : REQ-H07.1 ; critères : AC-H07.1 ; dépendances : H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H07.2** — P1, TODO : Capacités connues/inconnues et taille de contexte par modèle.
  Exigences : REQ-H07.2 ; critères : AC-H07.2 ; dépendances : H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H07.3** — P1, IN_PROGRESS : Changement actif à une frontière sûre avec état cohérent après échec.
  Exigences : REQ-H07.3 ; critères : AC-H07.3 ; dépendances : H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H07.4** — P1, IN_PROGRESS : Streaming complet, outils validés, usage et abort.
  Exigences : REQ-H07.4 ; critères : AC-H07.4 ; dépendances : H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H07.5** — P1, TODO : Routing autorisé et auth supportée ; diagnostic si indisponible.
  Exigences : REQ-H07.5 ; critères : AC-H07.5 ; dépendances : H03.3, H03.4, H03.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5.
- **H06.3b** — P1, TODO : Worktrees gérés durables, réutilisation et reprise après crash
  Exigences : REQ-H06.3, REQ-H06.4, REQ-H06.5 ; critères : AC-H06.3, AC-H06.4, AC-H06.5 ; dépendances : H06.3a.
- **H06.3c** — P1, TODO : Receipts code et intégration sérialisée vérifiée
  Exigences : REQ-H06.3, REQ-H06.4, REQ-H06.5 ; critères : AC-H06.3, AC-H06.4, AC-H06.5 ; dépendances : H06.3b.
- **H06.3d** — P1, TODO : Vue Git agents et nettoyage récupérable mesuré
  Exigences : REQ-H06.3, REQ-H06.4, REQ-H06.5 ; critères : AC-H06.3, AC-H06.4, AC-H06.5 ; dépendances : H06.3c.
- **H06.2b** — P0, TODO : Admettre deux worktrees et processus fournisseurs isolés.
  Exigences : REQ-H06.2 ; critères : AC-H06.2b ; dépendances : H06.2a.
- **H06.2c** — P0, TODO : Exécuter avec journaux privés et contrôleur seul écrivain.
  Exigences : REQ-H06.2 ; critères : AC-H06.2c ; dépendances : H06.2b.
- **H06.4a** — P0, TODO : Correction directe, interruption et reprise après disparition worker.
  Exigences : REQ-H06.2 ; critères : AC-H06.4a ; dépendances : H06.2c.
- **H06.3c2** — P0, TODO : Intégrer séquentiellement et vérifier le résultat composé.
  Exigences : REQ-H06.2 ; critères : AC-H06.3c2 ; dépendances : H06.4a.
- **H06.5c** — P1, TODO : Afficher responsabilités, phases et consommation workers dans Agents.
  Exigences : REQ-H06.2 ; critères : AC-H06.5c ; dépendances : H06.3c2.

### C6 — Terminal et validation (15)

[Prompt du sous-agent](prompts/C6.md).

- **H08.1** — P0, TODO : Vue travail progressive, intention et états lisibles.
  Exigences : REQ-H08.1 ; critères : AC-H08.1 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5.
- **H08.2** — P0, IN_PROGRESS : Consultation/correction objectifs, spec et mémoire avec historique.
  Exigences : REQ-H08.2 ; critères : AC-H08.2 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5.
- **H08.3** — P0, TODO : Vues agents, sources, outils et sorties complètes.
  Exigences : REQ-H08.3 ; critères : AC-H08.3 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5.
- **H08.4** — P0, IN_PROGRESS : Arrêt/reprise/changement actif compréhensibles au clavier.
  Exigences : REQ-H08.4 ; critères : AC-H08.4 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5.
- **H08.5** — P0, TODO : Tests Ink/PTY, trois tailles, resize, focus, Unicode et sans couleur.
  Exigences : REQ-H08.5 ; critères : AC-H08.5 ; dépendances : H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5.
- **H09.4** — P1, IN_PROGRESS : Installation packagée, export/import, rétention et racines portables.
  Exigences : REQ-H09.4 ; critères : AC-H09.4 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H09.5** — P1, TODO : Pannes injectées et traces sans credentials ni preuves inventées.
  Exigences : REQ-H09.5 ; critères : AC-H09.5 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H10.1** — P1, TODO : Corpus/manifeste complété et oracles gelés hors du producteur.
  Exigences : REQ-H10.1 ; critères : AC-H10.1 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H10.2** — P1, TODO : Rapports distinguant preuves déterministes, intégrations et modèles réels.
  Exigences : REQ-H10.2 ; critères : AC-H10.2 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H10.3** — P1, TODO : Runs répétés faible/fort modèle et comparaison OpenCode reproductible.
  Exigences : REQ-H10.3 ; critères : AC-H10.3 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H10.4** — P1, TODO : Feature réelle, correction, crash, reprise différée et substitution.
  Exigences : REQ-H10.4 ; critères : AC-H10.4 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **H10.5** — P1, TODO : Rapport de remplacement, seuils préfixés et limites explicites.
  Exigences : REQ-H10.5 ; critères : AC-H10.5 ; dépendances : B00.1, B00.2, B00.3, B00.4, H01.1, H01.2, H01.3, H01.4, H01.5, H09.1, H02.1, H02.2, H02.3, H02.4, H03.1, H03.2, H03.3, H03.4, H03.5, H04.1, H04.2, H04.3, H04.4, H04.5, H09.2, H09.3, H05.1, H05.2, H05.3, H05.4, H05.5, H06.1, H06.2, H06.3, H06.4, H06.5, H07.1, H07.2, H07.3, H07.4, H07.5, H08.1, H08.2, H08.3, H08.4, H08.5.
- **E01.4** — P1, TODO : Consultation/correction/export des scopes et workflows communs avec parcours clavier.
  Exigences : REQ-E01.4 ; critères : AC-E01.4 ; dépendances : E01.1.
- **H08.3n** — P1, TODO : Notifications utiles sourcées, sobres et dédupliquées
  Exigences : REQ-H08.3 ; critères : AC-H08.3 ; dépendances : H08.3a.
- **H10.3a** — P1, IN_PROGRESS : Pilote naturel réel sous modèle explicitement gratuit, oracle extérieur/trace/budget/source préservée
  Exigences : REQ-H10.3, REQ-H10.4 ; critères : AC-H10.3, AC-H10.4 ; dépendances : H09.4b.

### C7 — State graph et revalidation déterministe (25)

[Prompt du sous-agent](prompts/C7.md).

- **SG01.3** — P0, READY : Manifeste initial Cuesheet : sessions, objectifs, workers et intégration
  Exigences : REQ-SG01 ; critères : AC-SG01 ; dépendances : SG01.2.
- **SG02.1** — P0, READY : Index inversé, fermeture itérative et composantes fortement connexes
  Exigences : REQ-SG02 ; critères : AC-SG02 ; dépendances : SG01.2.
- **SG02.2** — P0, TODO : Mapping diff dirty/commit vers seeds, suppression et couverture inconnue
  Exigences : REQ-SG02 ; critères : AC-SG02 ; dépendances : SG02.1, SG01.3.
- **SG02.3** — P0, TODO : Plan adressable impactedNodes/invariants/tests/jobs, tri stable et cache par digest
  Exigences : REQ-SG02 ; critères : AC-SG02 ; dépendances : SG02.2.
- **SG03.1** — P0, TODO : Registre déclaratif des invariants et liaisons vers checks owner
  Exigences : REQ-SG03 ; critères : AC-SG03 ; dépendances : SG01.3.
- **SG03.2** — P0, TODO : Runner déterministe et preuves liées aux captures/contrats courants
  Exigences : REQ-SG03 ; critères : AC-SG03 ; dépendances : SG03.1, SG02.3.
- **SG03.3** — P1, TODO : Invalidation événementielle des preuves et revue humaine sourcée
  Exigences : REQ-SG03 ; critères : AC-SG03 ; dépendances : SG03.2, SG04.2.
- **SG04.1** — P0, TODO : Enveloppes événementielles avec actor/causation/context/evidence et idempotencyKey
  Exigences : REQ-SG04 ; critères : AC-SG04 ; dépendances : SG01.2.
- **SG04.2** — P0, TODO : Projection par taskId, transitions et append conditionnel ; migration des plans existants
  Exigences : REQ-SG04 ; critères : AC-SG04 ; dépendances : SG04.1.
- **SG04.3** — P1, TODO : Checkpoints reconstruisibles, adressage des références et tests crash/replay
  Exigences : REQ-SG04 ; critères : AC-SG04 ; dépendances : SG04.2.
- **SG05.1** — P0, TODO : Références de contrats et règles de compatibilité, sans remplacer les objectifs existants
  Exigences : REQ-SG05 ; critères : AC-SG05 ; dépendances : SG01.3.
- **SG05.2** — P1, TODO : Génération bornée des mocks/fixtures depuis contrat et seed explicite
  Exigences : REQ-SG05 ; critères : AC-SG05 ; dépendances : SG05.1.
- **SG05.3** — P0, TODO : Tests consommateur/mock et implémentation réelle, détection du drift
  Exigences : REQ-SG05 ; critères : AC-SG05 ; dépendances : SG05.2, SG03.2.
- **SG06.1** — P0, TODO : Compilation de sous-graphe borné, sources et permissions avant sélection
  Exigences : REQ-SG06 ; critères : AC-SG06 ; dépendances : SG02.3, SG04.2.
- **SG06.2** — P0, TODO : Binding contexte aux tâches/agents, contrôle avant effet et refresh direct
  Exigences : REQ-SG06 ; critères : AC-SG06 ; dépendances : SG06.1.
- **SG06.3** — P1, TODO : Reprise inter-modèle et historique ciblé, mesures taille/latence/tokens connus
  Exigences : REQ-SG06 ; critères : AC-SG06 ; dépendances : SG06.2, SG04.3.
- **SG07.1** — P0, TODO : API TypeScript typed : six opérations et erreurs/pagination/révisions
  Exigences : REQ-SG07 ; critères : AC-SG07 ; dépendances : SG06.1, SG05.1.
- **SG07.2** — P1, TODO : Transport MCP branché au registre owner de capacités/autorisations
  Exigences : REQ-SG07 ; critères : AC-SG07 ; dépendances : SG07.1, SG06.2.
- **SG07.3** — P1, TODO : Tests protocole/permissions/limites/CAS et audit de propositions non autoritaires
  Exigences : REQ-SG07 ; critères : AC-SG07 ; dépendances : SG07.2, SG04.3.
- **SG08.1** — P0, TODO : CLI impact/required-tests/ci-plan avec JSON déterministe
  Exigences : REQ-SG08 ; critères : AC-SG08 ; dépendances : SG02.3, SG03.1.
- **SG08.2** — P1, TODO : Raccord CI, catalogue owner et receipts par révision/capture
  Exigences : REQ-SG08 ; critères : AC-SG08 ; dépendances : SG08.1, SG05.3.
- **SG08.3** — P0, TODO : Comparaison sélection/validation complète et tests de sous-couverture
  Exigences : REQ-SG08 ; critères : AC-SG08 ; dépendances : SG08.2.
- **SG09.1** — P1, TODO : Vue tâche/impact/invariants avec sources, états pending/failed/stale
  Exigences : REQ-SG09 ; critères : AC-SG09 ; dépendances : SG06.2, SG08.1.
- **SG09.2** — P0, TODO : Parcours Cuesheet installé avec workers/revalidation/contrat et reprise
  Exigences : REQ-SG09 ; critères : AC-SG09 ; dépendances : SG09.1, SG07.3, SG08.3.
- **SG09.3** — P1, TODO : Benchmarks et audit adversarial complet, checklist acceptation humaine
  Exigences : REQ-SG09 ; critères : AC-SG09 ; dépendances : SG09.2, SG06.3.

## Limites et clôture

Le pilote gratuit réel a rencontré un HTTP 403 de la route OpenCode ; ne pas considérer ce test comme une comparaison qualité réussie. Les preuves déterministes existantes ne remplacent ni ce pilote ni les parcours installés, crash/reprise et multi-modèle.

Aucune tâche d’implémentation n’est clôturée par ce handoff. Le test de cette livraison vérifie la couverture exacte des IDs ouverts et la présence des sept prompts/master. L’orchestrateur recalcule les compteurs à son lancement. Il produit les preuves de chaque critère et un rapport de remplacement, avec limites, avant READY_FOR_MANUAL_ACCEPTANCE.
