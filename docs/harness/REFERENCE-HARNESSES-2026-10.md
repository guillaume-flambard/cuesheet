# CUESHEET — inspirations des harnesses et plan d'intégration (12 octobre 2026)

Statut : PROPOSITION / RECHERCHE. Ce document n'est ni une preuve d'implémentation, ni un second backlog canonique. Les critères et travaux restent suivis par docs/harness/TODO.md, docs/harness/state.json, docs/harness/ACCEPTANCE.md et les preuves. Toute promotion de ce document vers un chantier exige une divergence réelle observée, une spec, une tâche et une validation.

## Décision produit

CUESHEET est un harness universel entre une intention humaine et du travail vérifiable : conversation, recherche, spécification, développement, outils, agents, vérification et reprise. Le LLM propose ; le runtime observe les faits et décide de l'autorité de clôture. Changer de modèle ou de worker ne doit pas changer la définition du résultat attendu.

Ne pas le transformer en simple CLI de coding. Aucun dépôt Git ne doit être obligatoire pour une conversation. Ne pas réécrire aujourd'hui le noyau en Rust : la base réelle est TypeScript/Node >=22 avec React/Ink et des frontières core/adapters/surface déjà testées. Rust est un candidat futur pour un composant isolé, si des mesures justifient FFI/processus, binaires et maintenance multilangage.

## État vérifié avant ce document

- Dépôt GitHub déplacé de guillaume-flambard/cuesheet à memolabs-dev/cuesheet (identifiant GitHub inchangé : 1394916687).
- Projet local préservé sur branche de travail wip/pre-audit-snapshot-2026-10-04, avec modifications non commitées. Le remote origin de ce checkout a été redirigé vers l'organisation.
- Code existant : src/core/store.ts, loop.ts, ownership.ts, capability.ts ; src/state.ts, effects.ts, reconcile.ts, verify.ts ; adapters pour sessions, worktrees, workers, providers et recherche ; apps/terminal en Ink.
- Sources de vérité : docs/ARCHITECTURE.md, docs/harness/SYSTEM-MAP.md, docs/harness/NORTH-STAR.md, docs/harness/CHANTIERS.md, docs/harness/TODO.md, docs/harness/state.json.
- Aucun workflow .github présent dans main au constat, zéro exécution GitHub Actions et aucune release GitHub. Branche main non protégée au constat.
- Les résultats de tests cités dans STATUS.md sont historiques : ne jamais les afficher comme une nouvelle exécution.

## Inspirations : adopter le mécanisme, pas la dépendance entière

| Référence | Ce qui vaut la peine d'être étudié | Intégration CUESHEET envisagée | Rejet / précaution |
| --- | --- | --- | --- |
| Claude Code | subagents, hooks, instructions/skills, parcours de délégation | contrats de worker, points de contrôle, restitution claire | ne pas dépendre d'un modèle ou d'un service unique |
| OpenCode | UX TUI, sessions, catalogue de providers, extensibilité | découverte de modèles, palettes, diagnostics provider, extensions | ne pas dupliquer son état des sessions dans la vérité CUESHEET |
| Pi / pi-mono | boucle d'agent courte, extensions, outils composables, TUI | rendre le noyau lisible et facilement injecté en test | ne pas reconstruire le runtime sans bug mesuré |
| Codex | séparation sandbox/politique/outils, exécution traçable | permissions enforceées hors du LLM, receipts et isolation | permission textuelle != confinement OS |
| LangGraph | checkpoints, interruptions, reprise, état court/long terme | checkpoints dérivés de l'event store, reprise contrôlée | un checkpoint ne prouve pas qu'un effet externe n'a pas eu lieu |
| Letta / Letta Code | identité/mémoire durables entre sessions | faits sourcés, corrections humaines prioritaires, frontières de mémoire | ne pas traiter une mémoire inférée comme une preuve |
| OpenHands | environnements d'exécution, longue durée, supervision | workspace par worker, pilotage d'agents hétérogènes | coût opérationnel, isolation à démontrer |
| mini-SWE-agent | agent court, protocole simple, mesure reproductible | bancs de fixtures et version témoin minimale | les scores de benchmarks ne remplacent pas les preuves de production |
| Hermes Agent | mémoire versus skills, découverte progressive, expérience persistante | compétences chargées à la demande, apprentissage sourcé | un skill ne reçoit jamais de nouvelles permissions |
| Goose | portable desktop/CLI, providers et MCP | interfaces outils/providers interopérables, possibilité d'un client natif | pas de portage Rust pour le prestige technique |

Pi signifie ici pi-mono de badlogic. « LLaMA » cité oralement est principalement une famille de modèles, pas un harness ; « Open NNS » est à confirmer (probablement OpenHands) ; « MiniSW » renvoie vraisemblablement à mini-SWE-agent. Ne pas prendre ces transcriptions pour des dépendances validées.

## Meilleur des mondes : architecture cible, sans seconde autorité

Intention humaine → contrat versionné (objectif, critères, provenance, scope)
→ décision d'admission / capabilities / budget
→ plan de travail dérivé (si utile) → scheduler contrôleur
→ worker isolé (modèle + outils) → intention d'effet enregistrée AVANT dispatch
→ exécution sous politique OS et app → observation et reçu durables
→ réconciliation des effets incertains → capture du résultat figé
→ vérificateur indépendant / oracle → verdict lié à la révision actuelle
→ projection humaine lisible → correction, suite ou clôture PROVEN.

Frontières recommandées :
1. Core pur : identité, authority, invariants, contrats, projections, transitions. Aucun I/O.
2. Store : événements append-only, version, append-if-current, checkpoints reconstruisibles ; jamais de vérité concurrente.
3. Adapters : providers, tools, research, OS sandbox, workspaces, observation ; sources du monde externalisées.
4. Orchestrator : un seul écrivain du journal partagé dans la première version ; workers transmettent receipts et propositions avec revision/owner/scope/budget.
5. Verifier : preuves produites par un acteur indépendant du worker, hash du snapshot, type de test et critères épinglés.
6. Surface Ink : vue/projection pure et contrôles utilisateur ; afficher ne lance pas une action, interrompre est prioritaire.

## Décisions à formaliser en ADR avant implémentation

ADR-A — Single-writer : conserver un contrôleur écrivain unique avant d'envisager un store transactionnel multi-writer. Contrôles : révisions, replay concurrent, workers perdus.
ADR-B — Checkpoint : reconstruisible depuis events ; inclure cursor, schéma et digests ; le checkpoint optimise, il n'est jamais source de vérité.
ADR-C — Effect safety : l'intent est stable avant appel outil ; une réponse absente signifie UNKNOWN ; aucune relecture n'autorise à inventer DONE ; retry seulement si idempotence ou preuve de non-exécution.
ADR-D — Trust boundaries : contexte web, skills et sorties modèles sont non fiables ; la politique du contrôleur, les permissions OS et la provenance déterminent les actions admises.
ADR-E — Provider switch : changement uniquement à frontière sûre ; propositions précédentes marquées stale ; contrat humain et critères restent inchangés.
ADR-F — Rust decision : réaliser au préalable un profilage reproductible (startup, mémoire, latence et bundle) ; choisir ou rejeter le portage sur ces mesures.

## Plan ordonné ; chaque jalon a un gate

### P0 — Gouvernance, bot et CI (immédiat)
Référence : docs/harness/GITHUB-ORG-AND-BOT.md.
- Transfert du dépôt, remote local : accompli et vérifié.
- Installer/autoriser le GitHub App bot souhaité sur l'organisation et ce dépôt ; ne jamais supposer son identité ou installer une app sans validation.
- CI reproductible pour les PR, permissions minimales, revue humaine avant merge. Activer la protection de main après un premier check vert.
Gate : un PR de documentation reçoit un résultat CI, permissions connues, aucun bypass review, remote local intact.

### P1 — Fiabilité et vérité des résultats
Mapping : H01/H05/H09/H10, docs/ARCHITECTURE.md et NEXT-FRONTIER.md.
- Prouver qu'aucun « succès » n'est déduit de l'absence d'exception.
- Préserver la provenance des attentes et vérifier le contrat courant, même après correction R+1.
- Injecter crash entre demande/dispatch/receipt/observation/verdict ; observer UNKNOWN et refuser les doubles effets.
Gate : cas d'échec avant fix ; tests rouges puis verts ; replays, artefacts et verdicts documentés, preuves liées.

### P2 — Continuité, mémoire et providers
Mapping : H03/H04/H05/H07.
- Checkpoints compatibles et compaction bornée, récupération ciblée de sources originales.
- Reprise après crash / changement de modèle sans re-promouvoir une vieille décision.
- Skills sourcés, chargés sur demande, évalués sur travaux réels ; mémoire versionnée avec contradictions/autorité humaine.
Gate : 10 000 événements ; contexte borné ; aucune perte de contrainte critique ; reprise sur modèle de remplacement ; coûts/latences mesurés.

### P3 — Multi-agent contrôlé
Mapping : H06/E01 et worktrees existants.
- Décomposition selon résultat attendu et dépendances, pas selon un nombre fixe d'agents.
- Deux workers réels avec scopes non recouvrants par défaut, identité/lease, receipts et budget.
- Contrôleur compose et vérifie le résultat intégré ; un worker mort peut être remplacé sans sa conversation privée.
Gate : crash d'un worker, conflit Git, correction R+1 pendant exécution, intégration adversariale ; aucune clôture sans preuve post-intégration.

### P4 — Design TUI et expérience humaine
Mapping : H08/HL01–HL04 ; détails dans docs/harness/INTERFACE-DESIGN-2026-10.md.
- Un flux principal orienté intention, une ligne de travail, détails progressivement consultables.
- États distincts executing / awaiting / blocked / unknown / failed / verified / stale.
- Palettes modèles, sessions, agents, critères et preuve ; commandes clavier, jamais de mode imposé.
Gate : parcours Ink/PTY aux largeurs 40, 80, 120 ; resize, focus, pas de couleur, lecteurs de texte long, correction en direct et reprise.

### P5 — Évaluation et livraison
Mapping : H09/H10.
- Trois familles de tests : unit/invariants, E2E hermétiques, E2E vrais providers avec consentement et plafonds.
- Golden scenarios : IntentLane (workflow multi-fichiers), interruption après écriture, preuve devenue stale, refus capability, intégration de deux workers.
- Bench témoin contre version simplifiée et OpenCode sur mêmes tâches/budgets, publier aussi les échecs.
Gate : installer sur machine fraîche, journal sans secrets, suite CI verte, matrice de limitations, aucun gain revendiqué sans comparaison reproductible.

## Ordre recommandé pour le premier sprint après PR documentaire

S1 : installer bot + résultat CI ; mettre main sous revue.
S2 : sélectionner un défaut déjà reproduit dans NEXT-FRONTIER ou STATUS, identifier s'il est encore présent sur HEAD et écrire sa régression.
S3 : corriger la plus petite frontière qui fuit ; pas de nouvelle primitive tant que l'admission rule de README n'est pas satisfaite.
S4 : enregistrer preuve, CI, captures/trace et décision ADR ; seulement ensuite démarrer la prochaine tranche.

## Métriques à collecter (cibles, pas résultats mesurés)

Taux de tâches réellement PROVEN, faux succès, effets réexécutés après crash, temps jusqu'au rétablissement, conflits de worktree, coût par résultat vérifié, mémoire de contexte, latence première réponse, UX « temps pour comprendre l'état », taux de questions inutiles. Les valeurs de départ sont inconnues à documenter. Un « tests pass » sur fixture ne prouve pas un provider live.

## Sources primaires de référence

- Claude Code : https://code.claude.com/docs/en/sub-agents et https://code.claude.com/docs/en/hooks
- OpenCode : https://github.com/anomalyco/opencode
- Pi (référence correcte) : https://github.com/badlogic/pi-mono
- Codex : https://github.com/openai/codex
- LangGraph persistence : https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/persistence.mdx
- Letta : https://docs.letta.com/ et https://github.com/letta-ai/letta-code
- OpenHands : https://github.com/All-Hands-AI/OpenHands
- mini-SWE-agent : https://github.com/SWE-agent/mini-swe-agent
- Hermes : https://github.com/NousResearch/hermes-agent
- Goose : https://github.com/aaif-goose/goose

Licence, API précise, compatibilité et état de chaque mécanisme sont à revalider avant toute reprise de code. Ce sont des inspirations architecturales, pas des packages automatiquement adoptés.
