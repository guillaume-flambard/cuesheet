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
