# CUESHEET — chantiers exécutables et portes de validation (12 octobre 2026)

Statut : PLAN DE TRAVAIL PROPOSÉ. Cette synthèse ajoute des explications au backlog canonique docs/harness/TODO.md et state.json, sans le remplacer ni clôturer aucune exigence. En cas de contradiction, TODO/state/ACCEPTANCE/STATUS et la réalité du code prévalent.

## Principes de réalisation

- Mesurer/friction observée -> test de régression rouge -> plus petit changement -> tests verts -> review -> preuve.
- Une phase ne finit que lorsque le gate de preuve est satisfait sur commit identifié ; une spec seule ne ferme pas un chantier.
- Les agents ne sont pas les arbitres de leur succès ; la preuve est liée au contrat humain courant, à sa revision et aux octets figés.
- Conserver le TypeScript core/adapters/UI actuel. Rust ne commence qu'après une décision ADR appuyée par mesures.
- En cas de panne, privilégier UNKNOWN et inspection à succès inventé ou double exécution.
- Travailler en branches courtes et PR relues, conserver la working tree principale intacte.

## P0 — Organisation GitHub, bot transverse, CI et protections

État constaté 2026-10-12 :
- Repo public réellement transféré à memolabs-dev/cuesheet, GitHub repo ID 1394916687 préservé ; origin du checkout local mis à jour.
- Identité bot actuelle drop-agent-bot : compte GitHub utilisateur distinct, org member, droits write sur Drop et CUESHEET, accès authentifié indépendant testé.
- Bot a poussé une branche fix/ci-pnpm-build-20261012 et ouvert la PR draft #7 sous sa propre identité (pas comme Guillaume).
- PR #5 contient étude initiale et CI ; issue #6 suit baseline CI rouge.
- Main protégée avec 1 review requise, pas de force-push ni suppression ; admins encore exemptés ; check CI pas encore obligatoire parce que premier run rouge.
- Nom neutre recommandé pour bot : memolabs-agent ou memolabs-devbot. Ne pas changer le login au milieu des PR/automations : inventorier anciens handles, CODEOWNERS, mentions, scripts, credential manager, git remotes et statut de chaque PR, puis renommer depuis les paramètres du compte concerné, retester tout. L'ancien login risque de ne plus servir pour les mentions ou liens de profil.
- Ne pas transformer le bot en GitHub App par défaut : c'est aujourd'hui un compte GitHub distinct avec token utilisateur. Une App dédiée à permissions fines serait une amélioration future à évaluer.
- Ne pas donner admin, bypass, secrets ou action release au bot pour accélérer le dev.

Tâches encore ouvertes :
P0.1 Faire passer build/pack/install/typecheck et test terminal sur Ubuntu/macOS (PR #7 candidate).
P0.2 Isoler le test de timeline responsive Ubuntu, comprendre la divergence avant d'assouplir l'assertion.
P0.3 Exiger la CI verte sur main après stabilisation, préserver review humaine.
P0.4 Valider une réponse à commentaire de review puis un second commit sous bot, sans merge automatique direct.
P0.5 Documenter la politique tokens/rotation, branches, logs, séparation automation/tests/releases.
P0.6 Préparer renommage du bot avec checklist d'impact. Choix du nom et opération sur compte reportés.

Gate : nouvelle PR bot créée, commit effectivement attribué au bot, CI verte sur GitHub, publication d'un test local reproductible, review humaine valide, pas de bypass ni d'effets de bord sur Drop. Non atteint à la date de rédaction.

## P1 — Moteur / vérité du résultat / effects (Codex + Pi)

But : la boucle reste petite et les décisions viennent du monde, pas d'une phrase du LLM.

P1.1 Cartographier l'actuelle boucle runAgentLoop, EventStore, adapter execution, receipts et verify ; comparer avec docs/ARCHITECTURE.md et NEXT-FRONTIER.md. Repérer les branches qui transforment « pas d'exception » en succès.
P1.2 Écrire des fixtures pour les transitions intent -> dispatch -> result -> receipt -> projection -> verify.
P1.3 Distinguer explicitly REQUESTED, OBSERVED_SUCCESS, OBSERVED_FAILED, UNKNOWN, INCONCLUSIVE, VERIFIED, REJECTED ; pas de migration silencieuse des vieux journaux.
P1.4 Refuser les décisions contre revision obsolète avant effets. Les observations tardives sont conservées comme faits sans fermer le nouveau contrat.
P1.5 Isoler commandes et writable mounts au niveau OS (non garanti aujourd'hui par ShellToolRunner) et auditer les credentials hérités.
P1.6 Préserver sortie complète via digest/référence durable, ne pas confondre résumé tronqué et source de vérification.
P1.7 Fournir une interface driver provider/tool minimaliste, testable sans réseau, inspirée de Pi mais adaptée au core existant.

Gate P1 : six cas de crash et de tool refusal ; aucun double effet ou faux succès ; golden path IntentLane avec snapshot et vérification indépendante ; rapport de limites du sandbox. Tests bloquants sur GitHub ; benchmarks consommateurs non payants par défaut.

## P2 — Continuité des objectifs et mémoire (LangGraph + Letta + Hermes)

P2.1 Checkpoints versionnés liés au cursor/digest du journal ; le log reste la vérité, pas le snapshot de LLM.
P2.2 Continuité automatique entre tranches bornées, avec budget et arrêt humain prioritaires ; pas de boucles de stagnation infinies.
P2.3 Reconciliation des effets inconnus en consultant des observations externes après restart ; ne pas faire de retry automatique sans garantie d'idempotence.
P2.4 Contexte borné et récupération ciblée des sources ; préserver les instructions humaines anciennes et les deltas essentiels.
P2.5 Mémoire sourcée avec scope, auteur, revision et possibilité de contradiction ; corrections humaines prioritaires et intégrité du replay.
P2.6 Découverte/chargement de skills et attribution de résultats ; skill versionné, benchmark avant promotion ; jamais autorisation.
P2.7 Substitution de modèle en cours : arrêt des sorties tardives, sélection à frontière sûre, keep objectives/revisions/proofs.

Gate P2 : 10 000 events dans budget configuré ; source omise récupérable ; changement de modèle pendant appel tardif ; crash/reload ne déclenche aucun effet non reconcilié ; source mémoire corrigée non ressuscitée ; métriques de coût inconnues marquées UNKNOWN.

## P3 — Multi-agent partagé et orchestration (Claude Code + OpenHands)

P3.1 Formater WorkerPacket/Lease : goalId/R, result expected, owner, scope, capabilities, budget, base SHA, dependencies, deadline.
P3.2 Scheduler basé sur le Work Graph, pas sur un nombre arbitraire d'agents. Déléguer seulement si le gain attendu tient compte des conflits et coûts.
P3.3 Un contrôleur seul écrivain ; worker rend des observations/receipts, jamais un append durable direct au store partagé.
P3.4 Worktree par acteur mutable avec ownership durable, base/dirty snapshot, réconciliation des fichiers en conflit.
P3.5 Worker disparu : état MISSING/UNKNOWN et substitution après inspection. Aucun transcript privé comme unique source de décision.
P3.6 Intégration : composition explicite, capture après fusion, vérification sur l'ensemble, pas sur les patches isolés.
P3.7 Permissions par scope avec politique d'expiration, revocation et budgets communs ; preuves filtrées selon audiences.
P3.8 Run instrumentation avec coûts tokens/$ connus/inconnus, ressources CPU/mémoire, tests gagnés et conflits.

Gate P3 : deux vrais processus workers, un tué pendant mutation, correction humaine R+1, un conflit Git et un changement de modèle ; aucune perte de source ou dédoublement des effets ; critères sur résultat intégré. Ne pas cocher H06 global avant mesure complète.

## P4 — Human UI exacte (OpenCode + Pi + CUESHEET)

Produit : terminal d'abord, React/Ink et composants maison, aucune dépendance populaire de composants sans justification. Ne pas introduire simultanément refonte moteur et refonte UI. Projections seules alimentent le rendu.

P4.1 Inventorier App, state/store, Composer, Timeline, Header, StatusBar, overlays et tokens existants ; mesurer largeur/rendu réel.
P4.2 Définir toutes les transitions de statut et leur wording user-facing, y compris REQUESTED vs EXECUTED, PRODUCED vs PROVEN.
P4.3 Accueil minimal : intention, travail actuel, dernière observation, une décision utile si nécessaire, composer permanent.
P4.4 Vues progressivement déployées : Objectifs, Agents, Preuves, Sources, Mémoire, Sessions, Modèles, Inspect.
P4.5 Correction R+1 sans bloquer derrière une queue ; Cancel explicite, interruption, reprise, changement sûr de modèle.
P4.6 Trois géométries 40×14, 80×24, 120×40 ; navigation clavier, graphemes Unicode, scroll, aucun flash, fallback NO_COLOR.
P4.7 Mesurer le temps pour comprendre « pourquoi bloqué » ; une info de production ne doit jamais porter un pictogramme de preuve.

Gate P4 : parcours PTY complet et manuel, trois tailles, resize, focus, Enter dans overlay ne soumet pas le composer, sortie longue accessible, snapshots valides contre projections ; correction en live ; humain retrouve la preuve sans lire tout le journal.

## P5 — Évaluation comparative et publication (mini-SWE-agent + H10)

P5.1 Baseline version témoin minimale ; version actuelle CUESHEET ; OpenCode si test reproductible ; budgets comparables.
P5.2 Matrice d'invariants : sécurité, idempotence, replay, concurrence, mémoire, corrections, portability.
P5.3 Modèles réels avec autorisation et budget explicites, pas de fallback payant implicite ; fixtures et live séparés.
P5.4 Automatiser téléchargement/bundling et validation de paquet depuis racine temporaire ; pas de dépendance au checkout auteur.
P5.5 Tracer fausses réussites, copies d'erreurs, coûts réels estimés séparément, latences, effets incertains.
P5.6 Release après preuves de test CI et validation humaine, versionning/migrations/changelog/rollback documentés.

Gate P5 : installation testée depuis tarball en dehors du repo, API publique et CLI stables, core portable, rendu terminal fiable, CI release isolée. Ne pas dire « meilleur qu'OpenCode » avant mesure appariée.

## Décisions ADR proposées

ADR-P0 : bot partagé « memolabs-agent » (nom cible), permissions write au repo, PR review, pas de direct main et rotation de token.
ADR-E1 : intent-before-effect, effect receipt and reconciliation, explicit unknown, never retry blindly.
ADR-C1 : source-of-truth append-only ; checkpoints optimisent mais ne créent pas de deuxième vérité.
ADR-W1 : single-writer controller, workers receipts only, leases et snapshots versionnés.
ADR-P1 : provider/model substitution at safe boundaries, old outputs stale.
ADR-U1 : progressive Human UI React/Ink alimentée par projections pures.
ADR-R1 : benchmark before Rust migration; no premature rewrite.

Ces ADR ne sont pas acceptés simplement parce qu'ils apparaissent ici. Ajouter chaque décision à docs/decisions après preuves et revue.

## Ordre recommandé des PR

A. PR #7 pour build/CI, puis PRs pour les vrais défauts PTY / layout.
B. PR bot de test d'un commentaire et mise à jour, review humaine ; check CI requis et règle GitHub confirmés.
C. Petite régression P1 sur effet incertain/faux DONE, puis fix limité.
D. Reprise/checkpoint P2, puis remplacement modèle P2.
E. Deux workers + composition P3.
F. Design P4 après stabilité du runtime, avec tests PTY.
G. Bench et release P5.

**Ne pas** laisser ce document engendrer en parallèle des tickets qui doublonnent les IDs H01-H10, C1-C11, HL01-HL04 existants. Tout lot nouveau doit être rattaché à l'état canonique et n'est clos qu'avec preuve et commit.
