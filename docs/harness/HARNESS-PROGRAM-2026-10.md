# Programme des grands chantiers CUESHEET — octobre 2026

> **Programme opérationnel proposé.** Ce document ne remplace pas le backlog canonique [TODO.md](TODO.md) et [state.json](state.json). Les sous-tâches H01–H10 et leurs critères sont la source de vérité. Les orientations techniques viennent de [HARNESS-RESEARCH-2026-10.md](HARNESS-RESEARCH-2026-10.md). Ne cocher aucune ligne sans preuve sur HEAD/CI et sans résultat oracle.

## Décision produit

Construire un **runtime universel d'objectifs vérifiables** : intention naturelle -> contrat durable -> capacités et plan -> environnement choisi -> agents si utiles -> effets observés -> vérification indépendante -> état et prochaine décision intelligibles par l'humain. Le temps de vie du travail est supérieur au processus, modèle, chat ou ordinateur. Une information inconnue le reste. L'utilisateur corrige en parlant et ne choisit pas lui-même entre chat/plan/build.

**Ce qui existe** au 12 octobre (preuves GitHub sur main) : plusieurs milliers de lignes de runtime TS, sessions, modèles, mémoire partagée, tools, receipts, effet incertain, worker pool, worktrees, verification/IntentLane, TUI et CI stricte auto-merge. PRs #7, #10–#14, #16–#17 fusionnées. Tester l'implémentation réelle avant de dire « manque » ; TODO est volontairement conservateur. Issues ouvertes #8 (programme) et #15 (flakiness).

## Stratégie de développement

- Une PR = une tranche verticale assez petite pour prouver un invariant, pas un framework transplanté.
- **Le test rouge précède le patch** ; résultats verts ciblés, CI GitHub, puis PR auto-merge (mode solo), sans bypass.
- Réutiliser EventStore, projection, receipt, workspace, provider et composants existants ; pas de doublon de vérité.
- Une erreur modèle ne change ni les droits, ni les critères d'acceptation.
- Travail fait en worktree isolé : jamais stasher/reset les fichiers en cours dans /Users/memo/projects/cuesheet.
- Traces et dépense LLM : scripted/offline d'abord, live seulement avec budget explicite.
- Les estimations ci-dessous sont des **ordres de complexité des tranches**, pas des engagements calendaires.

## Ordre impératif et dépendances

```
T0 tests et traces ─────────────────────────────────────────────┐
  │                                                            │
  ├─ T1 intent/contrat + vérité des effets ──┬─ T2 durabilité ──┼─ T4 orchestration
  │                                         ├─ T3 providers ───┤      │
  │                                         └─ T5 contexte ────┼──────┘
  │                                                            │
  └─ T6 skills/mémoire/Recherche ───────────────────────────────┤
                                                               ▼
                                                   T7 Human UI V2
                                                               │
                                                               ▼
                                                   T8 release/benchmark
```

Les tranches de T3/T6 peuvent commencer plus tôt si testées isolément. **Décision UX P0 du propriétaire (12 octobre 2026)** : T7 commence immédiatement en parallèle de T0/T1/T2. Une interface qui ne peut pas remplacer Claude Code, Codex et OpenCode au quotidien est un échec produit, même avec un moteur correct. Première tranche Work Focus, puis Composer, diffs et sessions ; voir DAILY-DRIVER-UX-2026-10.md. Ne pas présenter une spec ou un mockup comme une fonctionnalité livrée et ne pas faire de big-bang.

### T0 — Test harness de preuve (P0, transversal) — mini-SWE-agent / Pi Telemetry

**État actuel** : GitHub CI strict, auto-merge bot, tests nombreux et fixtures PTY ; **issue #15 ouverte** pour races sur Mac/Ubuntu.
**Lots :** T0.1 reproduire/flaky test `shared-context-ui` et worker integration sous concurrence ; T0.2 séparer jobs core/terminal/PTY avec labels de stabilité et rapport clair des SKIP ; T0.3 matrice Linux/macOS + tests offline/real ; T0.4 ledger d'évaluation par commit/oracle/budget/couts ; T0.5 snapshots versionnés sans fuite de secrets.
**Gate :** 10 exécutions ciblées + 3 CI de PR répétées sans flaky connu ; échecs reproductibles conservés. Mesurer la couverture des scénarios macOS que Linux ne lance pas.
**Backlog** H09.5, H10.1, H10.2, #15. **Risque** fort : un système qui masque les flakes ne peut prouver les autres étapes.

### T1 — Contract kernel et vérité du monde (P1) — Codex + OpenCode V2

**État** : event store, intent-before-effect, explicit unknown, vérification séparée de la déclaration modèle, recovery des intents non observés.
**Lots :** T1.1 table des types goal/revision/criteria/source et migration H01 ; T1.2 ownership/reconciliation des receipts par effet réel, idempotency key uniquement si réellement supportée ; T1.3 garde de scope OS/environnement du provider avec tests négatifs ; T1.4 outcome `REQUESTED/UNKNOWN/OBSERVED/PRODUCED/VERIFIED` impossible à confondre dans les projections ; T1.5 validation et provenance indépendante avant un statut terminé.
**Gate :** crash avant et après mutation, un effet externe réellement incertain et aucun double effet, deux révisions humaines R1/R2 où la preuve R1 ne ferme jamais R2 ; tentative d'écriture hors sandbox bloquée par l'OS.
**Backlog** H01, H09.1–.3, H05.4. **Risque** fort ; priorité avant nouveaux outils puissants.

### T2 — Durabilité/continuité (P1) — Pi Durable + LangGraph + OpenCode V2

**État** : slices d'exécution, journal append-only, relance explicite, source retrieval, mémoire/objectif ; pas encore de preuve générale de checkpoint versionné 10k et recovery cross-provider.
**Lots :** T2.1 checkpoint dérivé de log (cursor/sha/schema/authoritative objective revision) ; T2.2 recovery matrix 6 positions de crash ; T2.3 continuations et budgets cumulés avec stop prioritaire ; T2.4 idempotence du wake/inbox et des external receipts ; T2.5 audit de 10k événements et context window borne ; T2.6 reprise sur autre machine/provider sans attribution rétroactive de réussite.
**Gate :** run interrompu reprend sans réécriture de l'histoire ; 0 replay aveugle d'outil mutateur ; budget et corrections R+1 survivent.
**Backlog** H03.3–.5, H05.1–.5, H09.2. **1re tranche en cours** : core frame history bounded sur 128 événements récents par défaut, max 512, séquences d'omission. Le contrôleur terminal a déjà son propre budget caractères ; le nombre d'événements n'est **pas** un vrai token budget.
**Risque** : masquer des contraintes anciennes au LLM ; préserver directives et preuves séparément et permettre lecture ciblée des événements omis.

### T3 — Providers et capacité d'action (P2) — Pi AI + OpenCode + Goose

**État** : adapters existants pour fournisseurs, routing tools, sélection modèle ; vérifier le niveau réel de streaming, cancellation et capabilities.
**Lots :** T3.1 registre versionné de capacités disponibles/connues/inconnues ; T3.2 `switch model` pendant stream/inférence/outil à frontière sûre ; T3.3 streaming, tokens réels, usage/coût avec UNKNOWN si absent ; T3.4 discovery MCP restreinte au scope et outils chargés selon besoin ; T3.5 contrats et packaging pour providers desktop/local/remote.
**Gate :** deux fournisseurs sur mêmes fixtures, interruption ne publie aucun late tool, route indisponible explicite, aucun prix inventé.
**Backlog** H07.1–.5, H04.1/.2. **Risque** : provider abstrait superficiel masquant les différences de tool calling.

### T4 — Multi-agent coordonné (P2) — Claude Code + OpenHands

**État** : workers isolés, packet / worktree / receipts et intégration existent ; restent preuves de résilience en conditions chargées, contention, remplacement et scopes par ressource.
**Lots :** T4.1 WorkerPacket versionné (contrat R, capacité, budget, lease, résultat) ; T4.2 scheduler opportuniste par dépendance vs rôle figé ; T4.3 ownership single-writer et worktree/lock par fichier ; T4.4 correction humaine R+1 propagée immédiatement ; T4.5 replacement après crash sans transcript privé ; T4.6 **vérification de l'artefact composé** après merge des patches.
**Gate :** 2 processus workers + conflit sur même fichier + kill/restart + modification de contrat R+1 ; aucun vieux résultat peut clore R+1. Mesurer coûts et gain par rapport à un worker.
**Backlog** H06.1–.5, H09.5, #15. **Risque** : vitesse apparente mais conflits et fausse finalisation.

### T5 — Mémoire, retrieval et résumé de contexte (P2) — Letta + LangGraph

**État** : mémoire editable/source, shared context budget caractères, outils read_history ; regarder les statistiques d'omission avant d'ajouter un compactor.
**Lots :** T5.1 source + auteur + scope + temps de validité ; T5.2 contradictions conservées et correction humaine prioritaire ; T5.3 mémoire chargée par intention/relevance ; T5.4 résumés de contexte réversibles par sourceSeq/digest ; T5.5 politique d'éviction après tests 10k+ et sans perte de critère épinglé.
**Gate :** petite fenêtre conserve critère human R courant et retrouve un vieux digest ; une correction ne ressuscite pas d'ancienne « mémoire ».
**Backlog** H03.1–.5, H01.3. **Risque** : résumé infidèle qui devient une fausse vérité.

### T6 — Skills, recherche et auto-amélioration **mesurée** (P2) — Hermes/GEPA + Goose

**État** : recherche et outils skill présents ; H04 n'est pas entièrement livré au standard d'acceptation du backlog.
**Lots :** T6.1 discovery `SKILL.md` interne/externe avec version+origine ; T6.2 activation à la demande, jamais source de droit ; T6.3 recherche fraîche avec attribution/citations et cache digest ; T6.4 « Skill Lab » : deux versions A/B sur fixtures tenues hors génération ; T6.5 rapport coût/score/failures -> PR de proposition, sans auto-promotion non mesurée ; T6.6 travail non coding (document/recherche) comme scénario première classe.
**Gate :** skill produit sur cas A gagne sur B, contraintes de scope constantes, aucun prompt-injection élargissant les droits, réseau absent = refus honnête.
**Backlog** H04.1–.5, H02.4, H10. **Risque** : l'optimisation de prompts surapprend le corpus ou dégrade la sécurité.

### T7 — Human UI V2 / Daily Driver (P0, tranches parallèles au moteur) — OpenCode + Pi TUI

**État** : design système déjà décrit dans [DESIGN-SYSTEM-V2-2026-10.md](DESIGN-SYSTEM-V2-2026-10.md) ; React/Ink, ViewStore/PTY existants. **La première priorité UX** est désormais l'expérience quotidienne, avec le programme [DAILY-DRIVER-UX-2026-10.md](DAILY-DRIVER-UX-2026-10.md), pas un chantier repoussé après la release.
**Lots :** T7.1 vue Work et but clair ; T7.2 états REQUESTED vs EXECUTED vs VERIFIED ; T7.3 volet preuve/sources/agents avec progressive disclosure ; T7.4 correction immédiate et bascule modèle ; T7.5 keyboard, focus, resize 40x14 / 80x24 / 120x40, couleurs désactivables ; T7.6 voir causes de blocage en 1 geste.
**Gate :** scénarios PTY avec vraie entrée clavier, 3 tailles, aucun Enter overlay ne soumet un vieux composer, preuve lisible sans consulter toute la log.
**Backlog** H08.1–.5. **Style** composants maison, sobre/humain ; pas de library UI populaire ajoutée par inertie.

### T8 — Produit, distribution et benchmark concurrentiel (P3) — Goose + mini-SWE-agent

**État** : build, pack/install oracle, CLI et core portable, pas de benchmark apparié conclusif.
**Lots :** T8.1 paquet vérifié en dehors du monorepo ; T8.2 migrations/export/import ; T8.3 sandbox macOS/Linux/Windows quand exécutable, surfaces « capabilities absent » ; T8.4 corpus universel : code, recherche, document, collaboration, crash ; T8.5 évaluation appariée CUESHEET/OpenCode/témoin minimal ; T8.6 version/release/signatures après preuve indépendante.
**Gate :** utilisateur tiers installe et exécute un objectif réel, sans checkout auteur ni secret caché ; rapport coût/latence/succès PROVEN et limitations.
**Backlog** H09.4–.5, H10.1–.5. **Risque** : prétendre un avantage concurrentiel sans mesure.

## Premier train de PR conseillé

1. **Core history window** : test 10 000 événements, lecture récente avec provenance de séquences ; T2/H03.3. Test sur modèle brut et compileFrame, sans changer l'EventStore.
2. **Provenance/read-history** : vérifier qu'une fenêtre tronquée peut demander effectivement les sources omises, et observer comportement sans réseau.
3. **CI stress/PTy** : reproduire et isoler le flaky de #15, mesurer Mac/Linux, pas juste rallonger les délais.
4. **Checkpoint + replay** : couche dérivée stable sans deuxième vérité.
5. **Contrat R et acceptance freeze** : migration H01/H09 et correction humaine en plein run.
6. **Model switch** : safe boundary et tests contre réponses tardives.
7. **Worker composition** : système à deux vrais workers avec vérification de la fusion.
8. **Skill Lab** et **UI** en PR incrémentales selon projections stabilisées.

Une exécution de recherche peut enrichir ce programme sans donner à l'agent le droit de s'écarter du backlog canonique. Toute PR doit indiquer la sous-tâche H et ses limites, pas cocher tout un lot dès le premier patch.

## Décision d'architecture recommandée

Le différenciateur commercial de CUESHEET n'est **pas** un plus grand catalogue de plugins, ni « 10 agents ». C'est :

1. **Une même intention durable** de bout en bout ;
2. **Des effets avec provenance** dont on sait ce qui est observé, incertain ou prouvé ;
3. **Des compétences et modèles substituables**, sans perte de responsabilités ni droits ;
4. **Une interface intelligible**, qui présente le résultat et la prochaine décision humaine.

Conserver cela comme critère de priorité avant chaque nouvelle fonctionnalité. Aucun Rust rewrite global avant mesure.
