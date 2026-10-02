# Vérification et couverture

## Catégories du Whole Project Protocol

Toutes les catégories ci-dessous sont classées pour le périmètre complet demandé,
pas seulement la tranche réseau. Aucune UNKNOWN n'est cachée comme N/A.

| Catégories | Classement | Couverture requise |
| --- | --- | --- |
| core behavior, API contracts, state transitions | APPLICABLE | H01/H02, cas de refus et critères versionnés |
| UX, loading, empty, error states, accessibility | APPLICABLE | H08, Ink/PTY/focus/contraste et navigation |
| cancellation, retries, state restoration, idempotency | APPLICABLE | H05, réponses tardives, recovery avant retry |
| persistence, integrity, migration, compatibility, user migration | APPLICABLE | H01/H09, anciens journaux et corruption |
| concurrency | APPLICABLE | H06, vrais processus, révisions et artefacts isolés |
| authentication, authorization, privacy, security | APPLICABLE | H04/H07/H09, sources non fiables et secrets |
| networking, offline behavior, caching, external integrations | APPLICABLE | H04/H07, absence de route/clé et cache daté |
| performance, metrics | APPLICABLE | H03/H10, taille de frame, coût connu/inconnu, latence |
| logging, diagnostics, testability, developer experience | APPLICABLE | H09/H10, traces interprétables et tests injectés |
| unit, integration, system, E2E, runtime, manual | APPLICABLE | strates distinctes, fixtures et essais réels explicitement identifiés |
| static checks | APPLICABLE | garde différentiel sans nouvelles erreurs ; baseline héritée déclarée |
| build, packaging, local deployment, rollback | APPLICABLE | H09.4, build/pack, HOME temporaire, rollback de données/config |
| remote server deployment | NOT APPLICABLE | aucun déploiement serveur demandé ou autorisé |
| documentation, cleanup of obsolete behavior | APPLICABLE | specs/état/backlog actualisés, pas de plans divergents |

## Gate de vérification par tâche

Lire l'AC de state.json et la spec ; écrire une régression qui échoue avant la
correction ; implémenter ; tests ciblés ; garde différentiel ; intégrations de
la tranche ; suite complète avant commit ; inspection du diff ; registre de
preuves et état. Une intégration réseau/locale réelle ne se remplace pas par un
mock. Une omission de test porte une raison et reste non vérifiée si obligatoire.

Le dernier commit passé n'est pas une preuve pour du code encore modifié depuis.
Les logs `/tmp` sont des traces locales auxiliaires ; inscrire résultats, commit
et scénarios dans STATUS pour qu'ils ne soient pas les seules preuves durables.

## Audit final indépendant du raisonnement d'implémentation

Quand les P0/P1 sont tous DONE, relire specs et AC depuis le contrat, inspecter
les chemins qui contournent les garde-fous et tenter corruption, gros volume,
abort, duplicates, état obsolète, panne provider, manque de clé, permissions,
reload, anciens schémas et navigation adverse. Exécuter le produit packagé et
le parcours fil rouge. Reclasser toute lacune comme TODO avec priorité et AC.
La revue finale n'est pas encore faite et son statut est PENDING.

Un verifier séparé n'est utilisé que si la délégation est autorisée dans le
contexte. À défaut, faire une passe séparée orientée falsification et publier
cette limite d'indépendance. Ce document ne donne aucune autorisation externe.

## Acceptation manuelle finale à produire

Après automatisation verte et zéro P0/P1 ouvert : démarrer une installation neuve,
exprimer une feature sans mode, consulter ses choix, corriger en cours, interrompre,
reprendre avec autre modèle et vérifier le résultat courant. L'objectif du test
humain est l'adéquation de l'expérience, pas la découverte de bugs connus.
Le statut final agent sera READY_FOR_MANUAL_ACCEPTANCE, puis DONE uniquement après
l'acceptation humaine requise. État actuel : IMPLEMENTING, aucune clôture annoncée.

Extension E01 : test/shared-memory.test.ts couvre vrai conflit entre deux processus, isolation de projets, montage entreprise explicite, source corrompue préservée, update externe pendant infer, publication par producer et récupération paginée. 20 tests ciblés avec typing/receipts/slices passent ; suite finale 736/734/0/2 PASS, puis neuf tests partagés PASS dont sélection de projet. Preuve durable : evaluation/shared-context-evidence.md. Réseau multi-machine, permissions équipe et parcours clavier scopes restent PENDING.

EV-CHECK-RENEWAL : check épinglé réautorisé explicitement à un ID/révision exact ; ancienne preuve refusée, même goal repris, reload préservé. 739/737/0/2 full PASS. H01.3a DONE ; H01.3 parent toujours IN_PROGRESS.

EV-CHECK-PALETTE : renouvellement explicite depuis la palette, snapshot de contrat refusé si périmé, annulation sans append. Vraies frappes Ink et trois tailles/resize ; 17 ciblés PASS, full 740/738/0/2 PASS. H08.2/H08.4 non clos.

EV-MODEL-USAGE : runtime/binding → Anthropic start/usage sink → journal de consommation dédié sous la claim terminal. Aucun déplacement de révision de proposition, compteur inconnu explicite, aucun prix inventé. 747/745/0/2 full PASS. H07.4a DONE ; H07.4 parent IN_PROGRESS.

EV-INSTALLED-TERMINAL : source → tsc CLI + ESM terminal bundle/asset/notices → npm pack → installation isolée → Node/TTY. PTY vrai et garde typing PASS, full 748/746/0/2 PASS. H09.4a DONE ; H09.4 reste IN_PROGRESS. Nouveau défaut de scope H09.3a en cours, avant toute clôture.

Vérification locale Vault/conteneurs : test/vault.test.ts (versions/source/CAS deux processus/reconstruction/corruption/grants), test/vault-runtime.test.ts (mise à jour/révocation pendant inference, aucun effet périmé, lecture sourcée), test/container-tools.test.ts (API Unix fake/bodies/faults/404 incertain + Docker réel isolé et runtime journal). Tests réels activés par CUESHEET_TEST_TOOL_SOCKET/CUESHEET_TEST_TOOL_IMAGE, sans les env runtime ; aucune fixture ne lance le daemon ni ne pull d'image. Runtime fixture garde le scope avant toute commande et neutralise montages/checks ambiants. Build/source typing différentiel/full requis ; diagnostics32 hérités ne sont pas déclarés corrigés.


H09.3d/e : refresh de route au start/reprise et protection des contrôleurs sous alias vérifiés, EV-ROUTE-ALIAS (evaluation/route-alias/evidence.md).50 ciblés PASS;796 tests/794 pass/0 fail/2 skipped;build PASS32 diagnostics hérités, garde différentielle PASS. H09.3b rétabli après correction du contre-exemple. Parents/R06 ouverts;global IMPLEMENTING.


2026-10-02 H06.1a/H06.5a : consultations parallèles via binding sélectionné → notes terminal.agent → propositions non vérifiées → palette Agents live. EV-AGENT-CONSULTATION ;58 ciblés, deux processus réels,802/800/0/2 full avant dernière correction projection,39 ciblés/build après. Configuration multi-modèle distinct par agent, code concurrent et auto-amélioration évaluée restent parents ouverts. Global IMPLEMENTING.


2026-10-02 H06.1b/H06.5b : choix humain routes par rôle/default → notes de session → resolver owner/scope → consultations modèles distincts ; palette Modèles des agents réutilise Models. EV-AGENT-MODELS :44 ciblés,808/806/0/2 full,7 tests supplémentaires IDs binary/UX,build/static PASS. Parents orchestration code/budgets/évaluation skills ouverts ; global IMPLEMENTING.


2026-10-02 H04.5a/H06.1c : sélection skills installés/session → sources versionnées → contexte propre à chaque consultation → guards fraîcheur → Agents affiche sources/versions/limites. EV-AGENT-SKILLS :49 initial/44 final ciblés,814/812/0/2 full final,build/static PASS. Sélection lexicale bornée ; essais/promotion/rollback et agents code restent parents ouverts. Global IMPLEMENTING.

## Situation — checkpoint 2026-10-02

H03.4a/H08.3a : tranche vérifiée, voir [spec](SITUATION-CONTEXT.md) et [EV-SITUATION](evaluation/situation/evidence.md). Snapshot renouvelé par inférence coordinateur/consultant ; palette Situation en lecture avec horloge live. 818/816/0/2 full ; 43 tests ciblés finaux et build/différentiel PASS (32 diagnostics hérités). Parents H03.3/H03.4/H06.4/H08.3 et harness global restent IMPLEMENTING ; aucun critère parent promu.

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

## H06.3c1 — checkpoint 2026-10-02

[EV-WORKTREE-INTEGRATION](evaluation/worktree-integration/evidence.md) : intégration locale sous check propriétaire, plan before/after fsynced, source/contrat contrôlés et finish indépendant dans source.43 ciblés finaux,849/847/0/2 full avant clarification texte finale,build/différentiel PASS32 baseline. Tranche DONE ; dépendances, workers parallèles, recovery/cleanup et selfhost réel restent ouverts. Global IMPLEMENTING.

## Build worktrees — 2026-10-02

[WORKTREE-BUILD.md](WORKTREE-BUILD.md) : H09.3f1→H09.3f2 (C4), capsule Node/Linux owner/image épinglée → metadata cache → prévalidation alias deps root/apps/packages → même conteneur readonly/networknone/receipts → vrai build/tests snapshot Cuesheet → source préservée. Vérification en cours ; aucun AC parent clos.

## H09.3f1/2 — checkpoint 2026-10-02

[EV-WORKTREE-BUILD](evaluation/worktree-build/evidence.md) : capsule owner Node/Linux automatique, dépendances readonly et source Cuesheet préservée ; build réel snapshot et56 tests Linux PASS.21 ciblés finaux,853/851/0/2 full avant ajout assertion test nested-package ; build host séquentiel/différentiel PASS32 baseline. Tranches DONE ; H09.4b parcours installé suivant, parents selfhost restent ouverts.

## H09.4b/b1/b2/b3 — checkpoint 2026-10-02

[EV-INSTALLED-SELFHOST](evaluation/installed-selfhost/evidence.md) : parcours installé PTY réel, provider fixture, code/test Linux isolés, intégration/check source, journal/notification/ressources confirmés.5 install/56 ciblés PASS,857/855/0/2 full et build séquentiel/différentiel32 baseline PASS. Défauts alias stockage/fallback après refus/alias dépendances Git corrigés. Tranches DONE ; modèle réel, check toolchain complet, workers parallèles et recovery restent ouverts. Global IMPLEMENTING.
