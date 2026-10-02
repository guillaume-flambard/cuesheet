# Graphe fini du chantier

Source machine : state.json, tableau `tasks`. Chaque tâche possède priorité,
statut, exigences, dépendances, systèmes, AC, méthode et preuve. TODO.md reste la
vue lisible par lots. ACCEPTANCE.md est la vue lisible des AC. Les trois doivent
être mis à jour ensemble ; DONE nécessite une preuve durable vérifiée.

DISCOVER/MODEL : SYSTEM-MAP, README et STATUS distinguent existant/intention/preuve.
SPECIFY : H01 à H10 et ACCEPTANCE. DECOMPOSE : tâches finies de state.json.
IMPLEMENT/VERIFY : sélectionner la portion indépendante d'une tâche READY ou
IN_PROGRESS, consigner preuve puis recalculer downstream. CLOSE : audit final de
VERIFICATION, zéro P0/P1, zéro AC en attente/échoué, zéro risque HIGH/CRITICAL ouvert.

Le protocole est adopté après les commits d'objectifs et de contexte. Les tâches
globales H01/H03 restent IN_PROGRESS car ces commits n'en couvrent qu'une partie.
Les tâches B00 sont DONE avec EV-B00. Le reste n'est pas marqué achevé par déduction.

Découverte requise : H07.2a, mauvais nom de capacité dans le frame, lié à R08 et
REQ-H07.2a. Sa reproduction précède toute correction core. Les autres diagnostics
hérités restent visibles ; leur existence ne donne pas autorisation à un fix bulk.

Le statut global IMPLEMENTING ne signifie pas READY_FOR_MANUAL_ACCEPTANCE. Les
essais externes indisponibles restent ouverts sans bloquer le travail indépendant.
Une priorité P0/P1 n'est pas rétrogradée pour accélérer une clôture.

Tranches découvertes rattachées explicitement aux six chantiers dans state.json : H09.3a→C4, H09.5a→C6, H09.1a→C1, H05.2a→C4 (dépend de H09.3a/H09.1a), E01.4a→C6 (dépend de E01.1/2). DONE de tranche ne satisfait pas l’AC parent complet. C6 IN_PROGRESS pour les parcours réellement implémentés.

E01.4b→C6 dépend de E01.1/2/E01.4a ; preuve EV-SHARED-MEMORY-EDIT. Le parent E01.4 comprend encore ergonomie d’édition/export/workflows d’équipe et n’est pas achevé.

Extension de directive Vault : E01.5a→E01.5b, E01.6a→E01.6→E01.5b→E01.7, rattachés à C3. E01.3 porte toujours auth/sync réseau. H09.3b/c→C4 distinguent backend explicite et choix automatique ; aucune tranche n'est la clôture de R06.

E01.5b1→C3 : tranche automatique locale indépendante, dépend de E01.5a/E01.6a ; parent E01.5b exige encore import/intégration/permissions entreprise réelles. E01.6a ne remplace pas E01.3/E01.6.

E01.5c→C3 (publication automatique) et H09.3c→C4 (route automatique) vérifiés en tranches. H07.2b→C5 dépend de H09.3c ; anciennes déclarations restent dans frame et doivent cesser d’étendre schémas provider.

H09.3d→C4 dépend de H09.3c/H07.2b ; configuration owner stable, disponibilité réobservée aux starts, pas mutation de runner actif.


H09.3d/e : refresh de route au start/reprise et protection des contrôleurs sous alias vérifiés, EV-ROUTE-ALIAS (evaluation/route-alias/evidence.md).50 ciblés PASS;796 tests/794 pass/0 fail/2 skipped;build PASS32 diagnostics hérités, garde différentielle PASS. H09.3b rétabli après correction du contre-exemple. Parents/R06 ouverts;global IMPLEMENTING.


2026-10-02 H06.1a/H06.5a : consultations parallèles via binding sélectionné → notes terminal.agent → propositions non vérifiées → palette Agents live. EV-AGENT-CONSULTATION ;58 ciblés, deux processus réels,802/800/0/2 full avant dernière correction projection,39 ciblés/build après. Configuration multi-modèle distinct par agent, code concurrent et auto-amélioration évaluée restent parents ouverts. Global IMPLEMENTING.


2026-10-02 H06.1b/H06.5b : choix humain routes par rôle/default → notes de session → resolver owner/scope → consultations modèles distincts ; palette Modèles des agents réutilise Models. EV-AGENT-MODELS :44 ciblés,808/806/0/2 full,7 tests supplémentaires IDs binary/UX,build/static PASS. Parents orchestration code/budgets/évaluation skills ouverts ; global IMPLEMENTING.


2026-10-02 H04.5a/H06.1c : sélection skills installés/session → sources versionnées → contexte propre à chaque consultation → guards fraîcheur → Agents affiche sources/versions/limites. EV-AGENT-SKILLS :49 initial/44 final ciblés,814/812/0/2 full final,build/static PASS. Sélection lexicale bornée ; essais/promotion/rollback et agents code restent parents ouverts. Global IMPLEMENTING.

## Situation — checkpoint 2026-10-02

H03.4a/H08.3a : tranche vérifiée, voir [spec](SITUATION-CONTEXT.md) et [EV-SITUATION](evaluation/situation/evidence.md). Snapshot renouvelé par inférence coordinateur/consultant ; palette Situation en lecture avec horloge live. 818/816/0/2 full ; 43 tests ciblés finaux et build/différentiel PASS (32 diagnostics hérités). Parents H03.3/H03.4/H06.4/H08.3 et harness global restent IMPLEMENTING ; aucun critère parent promu.

Gestion Git affinée : [AGENT-GIT.md](AGENT-GIT.md), H06.3a → b → c → d, TODO. Aucun worktree pour consultation ; isolation des écritures, intégration vérifiée, récupération et coût mesuré. Runtime encore à implémenter.

## H06.3a — checkpoint 2026-10-02

Inventaire Git read-only et décision controller-owned implémentés dans agent-git.ts, sans création ni branche ni integration runtime. [EV-AGENT-GIT-INVENTORY](evaluation/agent-git/evidence.md) : 4 nouveaux tests Git réel,37 ciblés,823/821/0/2 full final ; build/différentiel PASS32 diagnostics hérités. H06.3a DONE borné ; H06.3b/c/d TODO, parent H06.3 et global IMPLEMENTING. Création/reprise/admission/intégration/cleanup restent à livrer.

## Allocation worktrees et notifications — 2026-10-02

H06.3b1/H06.3a1 tranche adapter vérifiée : [EV-WORKTREE-ALLOCATION](evaluation/worktree-allocation/evidence.md), attribution/receipts/création detached/reuse physique/récupération conservative et refus Git filters ;45 ciblés finaux,831/829/0/2 full avant correction finale predicate racine, build PASS32 diagnostics hérités après. H06.3b/c/d et runtime admission restent ouverts. [NOTIFICATIONS.md](NOTIFICATIONS.md), H08.3n TODO, notifications significatives/dédup/références/source/canaux sobres, aucune notification livrée. Global IMPLEMENTING.

## Notifications et selfhost — checkpoint 2026-10-02

H08.3n1a DONE borné, [EV-NOTIFICATIONS](evaluation/notifications/evidence.md) :37 targeted,835/833/0/2 final full,build/différentiel PASS32 baseline. Centre live/M/read durable et badge sans calls externes ; parent H08.3n reste ouvert. [SELFHOST.md](SELFHOST.md) rend explicite le parcours développer Cuesheet depuis Cuesheet, non encore prouvé. H06.3b2 snapshot dirty IN_PROGRESS ; admission worker/intégration/dependencies/recovery restent ouverts. Global IMPLEMENTING.

## H06.3b2 — checkpoint 2026-10-02

[EV-GIT-SNAPSHOT](evaluation/git-snapshot/evidence.md) :48 targeted,838/836/0/2 final full,build/différentiel PASS32 baseline. Snapshot dirty humain/cible équivalente/source index conservé API livrée, tâche bornée DONE. Admission terminal, dépendances ignorées et intégration parent restent ouverts. Global IMPLEMENTING.

## H06.3b3 — checkpoint 2026-10-02

[EV-WORKSPACE-RUNTIME](evaluation/workspace-runtime/evidence.md) :51 targeted,842/840/0/2 final full,build/différentiel PASS32 baseline. Terminal prepare_workspace/retarget/sources/reprise et palette Workspaces livrés ; correction directe et source intacte vérifiées. finish refuse contribution non intégrée. Code workers parallèles, intégration/dépendances/selfhost réel restent ouverts. Global IMPLEMENTING.

## Build worktrees — 2026-10-02

[WORKTREE-BUILD.md](WORKTREE-BUILD.md) : H09.3f1→H09.3f2 (C4), capsule Node/Linux owner/image épinglée → metadata cache → prévalidation alias deps root/apps/packages → même conteneur readonly/networknone/receipts → vrai build/tests snapshot Cuesheet → source préservée. Vérification en cours ; aucun AC parent clos.

## H09.4b/b1/b2/b3 — checkpoint 2026-10-02

[EV-INSTALLED-SELFHOST](evaluation/installed-selfhost/evidence.md) : parcours installé PTY réel, provider fixture, code/test Linux isolés, intégration/check source, journal/notification/ressources confirmés.5 install/56 ciblés PASS,857/855/0/2 full et build séquentiel/différentiel32 baseline PASS. Défauts alias stockage/fallback après refus/alias dépendances Git corrigés. Tranches DONE ; modèle réel, check toolchain complet, workers parallèles et recovery restent ouverts. Global IMPLEMENTING.

## Workspaces et refus provider — 2026-10-02

[EV-WORKSPACE-PROVIDER](evaluation/workspace-provider/evidence.md) : H06.3d1/H07.1d DONE bornés, live projection unique/cache/next action et erreurs provider sûres.79/40 ciblés,859/857/0/2 full,build/différentiel32 baseline PASS. H10.3a reste ouvert :3 essais gratuits natifs reçus403 avant code, traces/goal/source préservés. Pas de contournement ni fallback payant, aucun résultat qualité modèle. Global IMPLEMENTING.

H05.2b (P1 DEFECT IN_PROGRESS) : résultat incertain → intent conservé → gate/replay → inspection/réconciliation, AC-H05.2 ; dépend H09.1a. Voir TODO.md.

H05.2b → H06.3b4 : gate uncertain → inventaire automatique → préparation durable → contexte frais → effet isolé.

H09.3f3 P0 IN_PROGRESS : oracle capsule depuis capture/scratch/source guards, voir WORKTREE-BUILD.md ; parent selfhost ouvert.

H09.3f4 P1 DEFECT IN_PROGRESS : portable imports/fixtures/CWD ; requis avant oracle complet selfhost, voir WORKTREE-BUILD.md.

2026-10-02 H09.3f3/f3a/f4/f3b DONE bornés : [EV-OWNER-CAPSULE](evaluation/owner-capsule/evidence.md), oracle image épinglée/capture/scratch/source guards, tmp Linux privé, portabilité et cache dérivé.869/867/0/2 host,851 Linux/0fail/18 explicit skips,44 ciblés/46 portable,build32 baseline. Modèle réel/agents code parallèles/recovery complet restent ouverts, global IMPLEMENTING.

2026-10-02 [MULTI-WORKER.md](MULTI-WORKER.md) : H06.2a IN_PROGRESS → H06.2b → H06.2c → H06.4a → H06.3c2 → H06.5c. Deux workers code isolés, journaux privés, correction directe, intégration vérifiée et UI ; tous les critères runtime restent ouverts.

2026-10-02 H06.2a DONE borné : [EV-WORKER-PACKETS](evaluation/worker-packets/evidence.md),14 ciblés PASS/build32 baseline. Validation pure des responsabilités ; admission/exécution/récupération et UI code workers encore pending. Global IMPLEMENTING.

2026-10-02 H06.2b1/c1 DONE bornés : [EV-CODE-WORKER-FOUNDATIONS](evaluation/code-worker-foundations/evidence.md),23 ciblés,882/880/0/2 full,build32 baseline. Préparation Git et boucles privées avec vrais processus Node ; raccordement terminal/journaux durables, skills/UI/intégration/recovery restent ouverts. Global IMPLEMENTING.

2026-10-02 H06.2c2 VERIFYING : [EV-TERMINAL-CODE-WORKERS](evaluation/terminal-code-workers/evidence.md),run_code_workers branché producer/runtime, journaux privés durables, Agents, correction et model change directs.35+9 ciblés,886/884/0/2 full,build32 baseline. Preuve Container privé dédiée et intégration composée/recovery/live model restent ouverts. Global IMPLEMENTING.

2026-10-02 H06.2c2/H06.3c2a DONE bornés : [EV-CODE-COMPOSITION](evaluation/code-composition/evidence.md),private Container proof et integrate_code_workers {} composition/check owner/apply/source finish.14 ciblés+1 Docker,893/891/0/2 full,build32 baseline. Crash recovery/cleanup/quota/UX dédiée et modèle réel restent ouverts. Global IMPLEMENTING.

2026-10-02 C7 : [STATE-GRAPH.md](STATE-GRAPH.md),9 epics/27 tâches, SG01.1 READY et suite TODO. Graphe versionné/impact/invariants/état événementiel/contrats-mocks/contexte/MCP/CI/UX. Spécification uniquement ; preuves pending, global IMPLEMENTING.

2026-10-02 SG01.1/2 DONE bornés : [EV-STATE-GRAPH-FOUNDATION](evaluation/state-graph-foundation/evidence.md), validateur JSON et loader/hash local,6 ciblés/build32 baseline PASS. Pas raccordés au runtime ; AC-SG01 PENDING, SG01.3/SG02.1 READY. Global IMPLEMENTING.
