# CUESHEET / QSheet — étude comparative des Agent Harnesses (12 octobre 2026)

Statut : ÉTUDE / proposition. Ce document ne prouve aucune implémentation. Complète REFERENCE-HARNESSES-2026-10.md, NORTH-STAR.md, SYSTEM-MAP.md, TODO.md et state.json. Backlog, critères et preuves existants restent canoniques.

## Intention et décision produit

CUESHEET est le harness qui transforme une intention humaine (conversation, recherche, document, logiciel, action machine) en travail vérifié. L'utilisateur n'a pas à choisir un mode ni organiser des agents. Il corrige l'objectif naturellement pendant le run. L'agent peut changer de modèle, mourir, être remplacé. L'objectif, les contraintes, les observations et les preuves restent indépendants du producteur.

Le LLM propose ; le contrôleur décide des capacités ; l'OS enforce les permissions ; le monde répond ; un vérificateur indépendant décide si le contrat courant est satisfait. Un résultat absent reste UNKNOWN. Une preuve liée à R1 ne clôt jamais silencieusement R2. Ne pas refaire OpenCode, ni transformer toute conversation en tâche de coding. Pas de repository obligatoire.

L'existant à protéger : TypeScript/Node 22+, core pur, adapters I/O, append-only store, State Graph, ownership, capability gates, projections, captures et oracles, worktrees et terminal React/Ink. Rust est un candidat uniquement après benchmark de lancement, mémoire, distribution, sécurité et coût d'intégration, pas une obligation.

## Classement pour CUESHEET (pas classement universel de qualité)

Les notes sont une priorité subjective d'étude /5, pas des résultats empiriques. Les scores élevés viennent de l'adéquation avec nos défauts et notre roadmap actuelle.

| Rang | Référence | Catégorie | Pertinence | Concept à reprendre |
| --- | --- | --- | --- | --- |
| 1 | Claude Code | harness coding intégré | 5/5 | subagents, hooks, cycle d'exécution |
| 2 | OpenCode | harness ouvert/TUI | 5/5 | providers, sessions, commandes et UX |
| 3 | Pi / pi-mono | noyau agent extensible | 5/5 | petite boucle, outils, extensions, session tree |
| 4 | OpenAI Codex | agent coding + policy | 5/5 | confinement, exécution, permissions/approbation |
| 5 | LangGraph | orchestration stateful | 5/5 | checkpointer, interruption, reprise, replay |
| 6 | Letta / Letta Code | agent à mémoire durable | 4/5 | identité, contexte, mémoire versionnée |
| 7 | OpenHands SDK / Canvas | runtime agents logiciel | 4/5 | environnements isolés, longue durée, supervision |
| 8 | mini-SWE-agent | agent minimal/évaluation | 4/5 | boucle témoin et benchmark reproductible |
| 9 | Hermes Agent | agent extensible/skills | 4/5 | mémoire, compétences à la demande, gateways |
| 10 | Goose | agent desktop/CLI | 3/5 | MCP, modèle-agnostic, portabilité |

Transcriptions incertaines : Qfit et QSheet désignent ici CUESHEET ; « Code » peut vouloir dire Claude Code ; « Open NNS » probablement OpenHands ; « MiniSW » mini-SWE-agent ; « LLaMA » est une famille de modèles et non un harness. llama.cpp pourrait être évalué séparément comme provider local, pas comme orchestrateur. Ces interprétations doivent être confirmées avant promotion dans les dépendances.

## Comparatif détaillé : mécanismes / anti-patterns / tests

### 1. Claude Code — rôle et délégation
Étudier : agents auxiliaires, hooks d'outils et de lifecycle, skills, contexte initial des travailleurs, transfert d'objectifs.
Adapter : paquet de délégation avec objectiveId, revision, workerId, rôle, scope, capabilities, budget, deadline, expectedArtifacts. Le scheduler choisit une séparation si elle améliore une tâche, sans nombre fixe d'agents.
Ne PAS adopter : un worker qui approuve son propre résultat ; un prompt comme autorisation ; des subagents partout même sans besoin.
Preuve exigée : un worker livre le patch de R1 alors que l'humain a modifié R2 ; le contrôleur le garde historique et ne ferme pas R2.
Sources : https://code.claude.com/docs/en/sub-agents ; https://code.claude.com/docs/en/hooks ; https://code.claude.com/docs/en/skills .

### 2. OpenCode — expérience TUI et fournisseurs
Étudier : modèles, sessions persistantes, catalogue dynamique, plugins, outils, transfert de contexte.
Adapter : choix de provider/model sans reprompter le contrat ; afficher capacités connues, inconnues et indisponibles ; mécanisme de bascule à frontière sûre ; palette fluide.
Ne PAS adopter : deuxième vérité des sessions ou secrets dans les préférences ; état « done » issu d'une réponse modèle.
Preuve exigée : interrompre un flux du modèle A, sélectionner B ; aucune sortie/outil tardif de A n'entre dans R courant.
Sources : https://opencode.ai/docs/ ; https://github.com/anomalyco/opencode .

### 3. Pi (badlogic/pi-mono) — minimalisme
Étudier : pi-ai, pi-agent-core, pi-tui, session tree, API d'extensions, custom tools, petites primitives.
Adapter : garder le core lisible, injecter modèles/outils/adapters en test, extensions explicitement bornées par capability gates.
Ne PAS adopter : plugins chargés avec les droits complets du contrôleur, sans sandbox ni revue.
Preuve exigée : une extension demande un write hors scope ou tente de muter les permissions ; refus traçable.
Sources : https://github.com/badlogic/pi-mono ; https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs .

### 4. Codex — exécution et frontière de confiance
Étudier : sandbox, modes d'approbation, séparation entre intention de commande, autorisation, exécution et observation.
Adapter : effet déclaré avant dispatch, policy côté runtime, commande dans un OS sandbox réel, sortie complète sous référence bornée, receipt et attribution.
Ne PAS adopter : croire qu'un cwd/argv allowlist est un sandbox OS ; confondre exit 0 et résultat accepté.
Preuve exigée : un binaire autorisé tente d'écrire en dehors du worktree ; l'OS empêche l'effet et l'observation n'est pas promue en succès.
Sources : https://github.com/openai/codex ; https://developers.openai.com/codex/security/ .

### 5. LangGraph — durabilité
Étudier : checkpoints, interrupteur human-in-loop, reprise sur thread, effets de replay et idempotence.
Adapter : checkpoints reconstruits depuis l'event store, versionnés avec cursor/digest/scope, jamais deuxième vérité ; effets externes reconcilés avant répétition.
Ne PAS adopter : « relancer le node » lorsqu'on ignore si un paiement, écriture ou publication a eu lieu.
Preuve exigée : crash après tool intent, avant receipt => UNKNOWN au reload, aucune répétition sans source de réalité.
Sources : https://docs.langchain.com/oss/python/langgraph/persistence ; https://docs.langchain.com/oss/python/langgraph/interrupts .

### 6. Letta — mémoire durable
Étudier : mémoire de travail et durable, identité d'agent, contexte entre sessions.
Adapter : mémoires attribuées à un auteur/scope/revision, sources lisibles et contradictions conservées ; correction humaine prédominante.
Ne PAS adopter : résumé LLM présenté comme fait observé ou mémoire reconstruite qui invente la provenance.
Preuve exigée : redémarrage, changement de modèle et correction contradictoire n'effacent pas la décision humaine.
Sources : https://docs.letta.com/ ; https://github.com/letta-ai/letta-code .

### 7. OpenHands — isolation et supervision
Étudier : SDK, environnements de développement isolés, longues tâches, surfaces de pilotage et multi-agent.
Adapter : workers dans des worktrees/containers avec leases ; une sortie d'agent est un artefact à intégrer, et seul le résultat composé peut être PROVEN.
Ne PAS adopter : concurrents écrivant naïvement le même checkout ou dialogues privés comme source de vérité.
Preuve exigée : deux workers concurrents touchent un même fichier ; le conflit bloque l'intégration silencieuse, puis un oracle indépendant vérifie la fusion.
Sources : https://github.com/All-Hands-AI/OpenHands ; https://docs.openhands.dev/ .

### 8. mini-SWE-agent — référence expérimentale
Étudier : boucle compacte, commandes, traces et protocole d'évaluation.
Adapter : version témoin minimale du moteur et banc de tests reproductibles contre elle ; mesurer « résultat réellement prouvé », coût et latence.
Ne PAS adopter : déduire de scores SWE une efficacité sur le web, les documents ou l'administration.
Preuve exigée : même tâche, même code, même budget, même oracle, mêmes fixtures et échecs publiés.
Sources : https://github.com/SWE-agent/mini-swe-agent ; https://mini-swe-agent.com/ .

### 9. Hermes Agent — skills persistants
Étudier : découverte des skills, mémoire, tâches programmées, gateways, provider flexibility.
Adapter : skills chargés à la demande, provenance/version/test d'utilité et promotion sous autorité ; la compétence ne crée jamais de permission.
Ne PAS adopter : empiler des SKILL.md non évalués, promouvoir du texte web non fiable en instruction système.
Preuve exigée : un skill proposé dans une session réussit un deuxième cas indépendant sans extension de capacité.
Source : https://github.com/NousResearch/hermes-agent .

### 10. Goose — transport et packaging
Étudier : CLI, application desktop, architecture Rust, extensibilité et MCP.
Adapter : interface provider/tool agnostique, possibilité future d'un composant natif autonome, protocole client ouvert.
Ne PAS adopter : migration Rust entière sans mesure ou dépendance à une couche non contrôlée.
Preuve exigée : mêmes requêtes outils sur macOS/Linux/Windows, capacité manquante rapportée et non simulée.
Source : https://github.com/aaif-goose/goose .

## Les meilleures idées à assembler, sans empilement de frameworks

Flux logique :
1. Intent -> contrat durable, objectif ID/R, critères d'acceptation épinglés (autorité humaine).
2. Admission -> autorisations, scopes, budget, capabilities réelles, modèle sélectionné.
3. Work Graph -> dépendances, tâches prêtes, décisions de spawn selon gain marginal.
4. Scheduler -> seul écrivain pour une première version, workers à scopes bornés.
5. Boucle agentique -> Pi comme inspiration de sobriété, OpenCode pour providers/UX.
6. Execution -> Codex comme inspiration de sandbox/policy, effects + receipts.
7. Observation -> résultat et état UNKNOWN explicites, append-only events.
8. Verify -> snapshot hashé, oracle indépendant, critères R actuelle uniquement.
9. Projection -> interface humaine, correction et interruption prioritaires.
10. Recovery -> LangGraph pour checkpoints, Letta pour mémoire, jamais replay aveugle.

Séparations :
- Intention ≠ plan proposé.
- Effet demandé ≠ commande effectivement exécutée ≠ résultat observé.
- Résultat produit ≠ preuve vérifiée ≠ objectif fermé.
- Checkpoint ≠ journal canonique.
- Source web/skill ≠ autorité de permission.
- Discussion privée d'un worker ≠ état commun.

## Protocoles et types candidats, NON livrés

Objectif : id, revision, intentOriginal, humanCorrections, acceptanceCriteria, sourceRefs.
Run : id, objectiveId/revision, state, budgets, provider, sourceDigest, checkpointCursor.
WorkerLease : id, owner, taskId, scope, capabilities, baseCommit, expiry, budget.
EffectIntent : id, runId, tool, inputDigest, preconditions, scope, idempotencyKey si disponible.
EffectObservation : id, effectId, outcome succeeded/failed/unknown, source, receiptRef, outputDigest.
Verification : objectiveId, revision, artifactDigest, checkDigest, verdict VERIFIED/REJECTED/INCONCLUSIVE, coverageLimit.
HumanDelta : audience, scope, previousCursor, currentCursor, authoritativeRefs, deliveryStatus, no assumption of comprehension.

Ces types ne remplacent PAS src/core/store.ts, src/verify.ts, src/effects.ts ou state.json. Avant code, construire la table de compatibilité, démontrer l'invariant manquant et ne modifier que la frontière nécessaire.

## Corpus expérimental et métriques

A. IntentLane : correction de code multi-fichiers, deux modèles, révision humaine R+1 et preuve post-intégration.
B. Crash matrix : avant intent / après intent / pendant exécution / avant receipt / avant capture / avant verdict.
C. Concurrence : deux workers, conflit worktree, rebase justifié, intégration sûre.
D. Mémoire : contradiction model/human, sources périmées, 10 000 événements, context window bornée.
E. Skills et recherche : lecture d'une instruction malveillante, absence d'extension d'autorité.
F. Sans dépôt : question et document sans supposer Git ni shell.
G. Portabilité : macOS/Linux/Windows et absence de service/provider.

Données obligatoires : SHA du code, provider et modèle réels, budget, temps et coût mesurés ou UNKNOWN, consentement requis pour tests payants, manifest de fixture, source brute expurgée, critère épinglé, résultat de l'oracle, éléments non couverts.

Les principales métriques : taux PROVEN, faux DONE détectés, double effet après crash, reprise, latence, coût par objectif accepté, taux de conflits, taille contexte, problèmes de focus/UX. Aucun gain supposé sans protocole témoin.

## Recommandation d'ordre

Immédiat : CI, GitHub bot et droits ; faux succès et intégrité des effects.
Ensuite : reprises et checkpoints ; mémoire sourcée ; changements de modèle.
Puis : multi-worker et worktree integration ; tool isolation véritable.
Après : UX exacte React/Ink, panels hiérarchisés et design system.
Enfin : bench/version installable/release, Rust uniquement si un bottleneck l'exige.

Correspondance : H01/H05/H09/H10 pour vérité, H03/H04 pour contexte, H06 pour agents, H07 pour providers, H08/HL pour UX ; pas de seconde roadmap canonique. Voir IMPLEMENTATION-GATES-2026-10.md pour les tâches testables.

## Fraîcheur, limites et provenance de cette étude

Les liens sont des références amont officielles/publics, pas preuve d'une intégration ni d'un test comparatif. Vérifier la version/commit et la licence avant toute reprise de code. Une idée utile peut être conservée au NORTH STAR sans entrer dans le backlog. La source d'autorité sur ce qui est réellement livré est le dépôt, ses tests et ses preuves.
