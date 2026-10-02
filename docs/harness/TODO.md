# Backlog exécutable

Chaque ID renvoie à sa spec H01 à H10. Une case se coche après implémentation,
régressions, revue, résultat consigné et commit local. Les IDs sont stables ;
ajouter des sous-tâches si nécessaire, sans effacer les travaux non terminés.
Les dix specs sont intégralement dans le périmètre. Les commandes manuelles ne
constituent pas l'accomplissement d'un comportement censé être automatique.

## Fondations déjà livrées

- [x] Sessions persistantes et reprise explicite : `d5f1062`.
- [x] Choix providers/modèles et préférences : `76ea095`, `d51a989`.
- [x] Contexte partagé livré au modèle : `5177958`.
- [x] Mémoire éditable avec historique : `53844cd`.
- [x] Outils internes d'organisation et mémoire automatique : `f4f05bf`.

Ces cases décrivent ces tranches seulement. Elles ne valident pas les objectifs
plus complets portant sur les mêmes concepts ci-dessous.

## Lot 0 : établir le chantier

- [x] B00.1 Lire HANDOFF, README, règles applicables et specs du premier lot.
- [x] B00.2 Relever HEAD, état Git, tests et diagnostics initiaux dans STATUS.md.
- [x] B00.3 Construire le manifeste minimal du corpus H10.1 et un scénario fil rouge.
- [x] B00.4 Reproduire les défauts d'identité du plan et de contexte non borné avant correction.

Terminé quand la baseline et les reproductions sont enregistrées, avec distinction
tests réels/scriptés, sans modifier le document utilisateur non suivi.

## Lot 1 : contrat de travail stable

Dépendance : lot 0. Spec : H01, début H09.

- [ ] H01.1 Schémas versionnés, IDs stables, projections et dépendances.
- [ ] H01.2 Extraction et correction d'objectif en conversation ordinaire.
- [ ] H01.3 Critères avec provenance, révision et autorité explicites.
- [ ] H01.4 Raccordement plans/tâches/mémoire/preuves au contrat courant.
- [ ] H01.5 Compatibilité des goals/plans déjà enregistrés.
- [ ] H09.1 Validation des payloads, migration et replay des anciennes sessions.

Terminé quand un objectif peut être reformulé et son critère modifié sans perdre
son ID, ni réutiliser une preuve obsolète. Deux objectifs identiques restent séparés.

## Lot 2 : décider et entretenir automatiquement

Dépendance : lot 1. Specs : H02 et H03.

- [ ] H02.1 Décision structurée avec base de révision et admission runtime.
- [ ] H02.2 Specs utiles et tâches identifiables, versionnées, consultables/exportables.
- [ ] H02.3 Processus léger et questions seulement quand nécessaires.
- [ ] H02.4 Révision du plan à partir des échecs observés et revue appropriée.
- [ ] H03.1 Extraction mémoire sourcée/idempotente après échanges et observations.
- [ ] H03.2 Contradictions, réponses et leçons avec historique.

Terminé quand les fixtures normales créent/entretiennent leurs records sans `/memory`
ou sélection de mode, tout en conservant l'autorité des corrections humaines.

## Lot 3 : reprendre avec un contexte utile

Dépendance : lots 1 à 2. Spec : H03.

- [ ] H03.3 Compilateur borné et lecture ciblée des sources omises.
- [ ] H03.4 Reconstructions et isolation session/projet/personnel.
- [ ] H03.5 Journal long, petite fenêtre et substitution de modèles mesurés.

Terminé quand le scénario 10 000 événements conserve la contrainte déterminante,
reste dans le budget du modèle et peut récupérer les preuves condensées.

## Lot 4 : recherche et capacités apprenantes

Dépendance : lots 1 à 3. Spec : H04.

- [ ] H04.1 Choisir/raccorder le connecteur de recherche et sa configuration explicite.
- [ ] H04.2 Lecture locale/web, résultat durable, limites et cancellation.
- [ ] H04.3 Attribution, fraîcheur/version et citations effectivement obtenues.
- [ ] H04.4 Découverte des skills configurés et chargement à la demande.
- [ ] H04.5 Skill local essayé, révisé, réutilisé et promouvable avec preuves.

Terminé quand une incertitude technique déclenche une recherche attribuée, et
qu'un skill créé pour un besoin réel est utilisé par une autre exécution.
Une route réseau indisponible est signalée, pas remplacée par une source inventée.

## Lot 5 : continuité et effets incertains

Dépendance : lots 1 à 3 ; H09.2/H09.3. Specs : H05, H09.

- [ ] H09.2 Recovery explicite et reconciliation core/vue/artefacts.
- [ ] H09.3 Contrats d'outils et résultats complets référencés.
- [ ] H05.1 Cycle de vie run/tranche/inférence distinct de l'objectif.
- [ ] H05.2 Continuation bornée entre tranches actives.
- [ ] H05.3 Reconstruction à la limite et détection de stagnation.
- [ ] H05.4 Inspecter/reconcilier avant de répéter un effet incertain.
- [ ] H05.5 Budgets cumulés, arrêt propagé, reprise au lancement explicitement configurable.

Terminé quand une tâche de plus de huit inférences se poursuit automatiquement,
Ctrl+C l'arrête durablement et un reload ne répète pas un effet incertain.

## Lot 6 : plusieurs agents, un travail commun

Dépendance : lots 1 à 3 et 5. Spec : H06.

- [ ] H06.1 Contrats de délégation et choix automatique des rôles.
- [ ] H06.2 Contrôleur et deux workers processus réels avec receipts/revisions.
- [ ] H06.3 Workspaces isolés et intégration explicitement vérifiée.
- [ ] H06.4 Correction à R+1, rebase et remplacement après disparition.
- [ ] H06.5 Responsabilités et budgets partagés exposés aux projections.

Terminé quand un worker disparaît et son remplaçant reprend sans transcript privé,
et que la preuve finale concerne le résultat intégré après la dernière correction.

## Lot 7 : modèles et flux

Dépendance : lots 3 et 5 pour changement actif. Spec : H07.
Le transport Anthropic peut être développé plus tôt après lot 1.

- [ ] H07.1 Anthropic direct, contrats et essai d'intégration configuré.
- [ ] H07.2 Capacités connues/inconnues et taille de contexte par modèle.
- [ ] H07.2a Reproduire puis corriger le nom de capacité absent du frame (défaut découvert R08, P1).
- [ ] H07.3 Changement actif à une frontière sûre avec état cohérent après échec.
- [ ] H07.4 Streaming complet, outils validés, usage et abort.
- [ ] H07.5 Routing autorisé et auth supportée ; diagnostic si indisponible.

Terminé quand une sélection pendant un flux ne publie pas la réponse obsolète,
ne déclenche pas d'outil partiel et préserve contrat et mémoire.

## Lot 8 : terminal de travail

Dépendance : projections des lots 1 à 7, au fil de leur disponibilité. Spec : H08.

- [ ] H08.1 Vue travail progressive, intention et états lisibles.
- [ ] H08.2 Consultation/correction objectifs, spec et mémoire avec historique.
- [ ] H08.3 Vues agents, sources, outils et sorties complètes.
- [ ] H08.4 Arrêt/reprise/changement actif compréhensibles au clavier.
- [ ] H08.5 Tests Ink/PTY, trois tailles, resize, focus, Unicode et sans couleur.

Terminé quand le parcours complet est faisable avec les vraies frappes sans passer
par un mode manuel ni une commande interne obligatoire.

## Lot 9 : installation et qualité démontrée

Dépendance : fonctions concernées terminées. Specs : H09 et H10.

- [ ] H09.4 Installation packagée, export/import, rétention et racines portables.
- [ ] H09.5 Pannes injectées et traces sans credentials ni preuves inventées.
- [ ] H02.5 Choix du processus évalués avec des providers réels.
- [ ] H10.1 Corpus/manifeste complété et oracles gelés hors du producteur.
- [ ] H10.2 Rapports distinguant preuves déterministes, intégrations et modèles réels.
- [ ] H10.3 Runs répétés faible/fort modèle et comparaison OpenCode reproductible.
- [ ] H10.4 Feature réelle, correction, crash, reprise différée et substitution.
- [ ] H10.5 Rapport de remplacement, seuils préfixés et limites explicites.

Terminé quand le rapport rattache chaque promesse à ses runs, versions, commits
et preuves, avec les écarts qui restent. Une incapacité du modèle est un résultat
à consigner et à traiter, pas une raison de relâcher le critère.

## À chaque lot

- [ ] Ajouter une régression liée au comportement qui échoue avant la correction.
- [ ] Vérifier les diagnostics sans masquer les nouveautés dans la baseline.
- [ ] Exécuter les tests appropriés puis la suite d'intégration complète.
- [ ] Faire une revue des mutations, de la provenance, des effets et des races.
- [ ] Mettre à jour spec, cases réellement achevées, STATUS et preuves du lot.
- [ ] Commit local ciblé ; préserver les changements étrangers au lot.

Ces six cases sont un gabarit à recopier dans STATUS pour chaque lot, pas un
lot unique à cocher après la première tranche.


Extension E01 : E01.1 et E01.2 vérifiés par EV-SHARED-SCOPES (evaluation/shared-context-evidence.md). E01.D1 corrigé et régressé. E01.3 et E01.4 restent TODO. Projet IMPLEMENTING ; aucune clôture globale.

## Tranches de fiabilité et contexte partagé (état courant)

- [x] H09.3a outils/recherche/skills dans le projet sélectionné — EV-SCOPED-RUNTIME.
- [x] H09.5a credentials natifs hors environnement des outils — EV-TOOL-ENVIRONMENT.
- [x] H09.1a provenance auteur conservatrice — EV-OBJECTIVE-AUTHORSHIP.
- [x] H05.2a même objectif repris dans son projet lié — EV-SCOPE-RESUME.
- [x] E01.4a consultation projet/entreprise au clavier, provenance/pagination — EV-SHARED-CONTEXT-UI.

Parents H05/H09/E01.4 restent ouverts ; édition/export/workflows d’équipe, transport/auth multi-machine et preuves de remplacement restent nécessaires.

- [x] E01.4b correction/résolution humaine de mémoire projet partagée, historique/CAS et compaction — EV-SHARED-MEMORY-EDIT. Export/formulaire/workflows et auth restent parent E01.4/E01.3.

## Extension Vault canonique (directive2026-10-01)

- E01.5a P0 IN_PROGRESS : corpus versionné, sources/historique et retrieval textuel reconstructible.
- E01.6a P0 IN_PROGRESS : grants contrôleur séparés, avant recherche et après lecture.
- E01.6 P0 TODO : hiérarchie/droits entreprise intégrés, authentification avec E01.3.
- E01.5b P0 TODO : retrieval automatique du goal et invalidation des références périmées.
- E01.7 P1 TODO : métriques pertinence/latence/coût et choix vectoriel justifié.
- H09.3b P1 IN_PROGRESS : backend Docker local et reçus durables ; H09.3c P1 TODO : sélection/admission automatique.

Statut exact et preuves : state.json ; pas de parent terminé par inférence.

Preuve EV-LOCAL-VAULT-CONTAINERS : H09.3b/E01.5a/E01.6a/E01.5b1 DONE pour les tranches locales finies ; aucune AC parent globale passée. E01.3/4/5b/6/7 et H09.3c restent ouverts. state.json est le statut courant.

E01.5c/H09.3c DONE pour tranches locales, EV-AUTOMATIC-VAULT-TOOLS ; H07.2b P1 IN_PROGRESS vocabulaire provider ancien, rattaché C5, dépend de H09.3c.

H07.2b DONE EV-CURRENT-TOOLS ; H09.3d P1 IN_PROGRESS : refresh de disponibilité de route à reprise/new goal.


H09.3d/e : refresh de route au start/reprise et protection des contrôleurs sous alias vérifiés, EV-ROUTE-ALIAS (evaluation/route-alias/evidence.md).50 ciblés PASS;796 tests/794 pass/0 fail/2 skipped;build PASS32 diagnostics hérités, garde différentielle PASS. H09.3b rétabli après correction du contre-exemple. Parents/R06 ouverts;global IMPLEMENTING.


2026-10-02 H06.1a/H06.5a : consultations parallèles via binding sélectionné → notes terminal.agent → propositions non vérifiées → palette Agents live. EV-AGENT-CONSULTATION ;58 ciblés, deux processus réels,802/800/0/2 full avant dernière correction projection,39 ciblés/build après. Configuration multi-modèle distinct par agent, code concurrent et auto-amélioration évaluée restent parents ouverts. Global IMPLEMENTING.


2026-10-02 H06.1b/H06.5b : choix humain routes par rôle/default → notes de session → resolver owner/scope → consultations modèles distincts ; palette Modèles des agents réutilise Models. EV-AGENT-MODELS :44 ciblés,808/806/0/2 full,7 tests supplémentaires IDs binary/UX,build/static PASS. Parents orchestration code/budgets/évaluation skills ouverts ; global IMPLEMENTING.


2026-10-02 H04.5a/H06.1c : sélection skills installés/session → sources versionnées → contexte propre à chaque consultation → guards fraîcheur → Agents affiche sources/versions/limites. EV-AGENT-SKILLS :49 initial/44 final ciblés,814/812/0/2 full final,build/static PASS. Sélection lexicale bornée ; essais/promotion/rollback et agents code restent parents ouverts. Global IMPLEMENTING.

## Situation — checkpoint 2026-10-02

H03.4a/H08.3a : tranche vérifiée, voir [spec](SITUATION-CONTEXT.md) et [EV-SITUATION](evaluation/situation/evidence.md). Snapshot renouvelé par inférence coordinateur/consultant ; palette Situation en lecture avec horloge live. 818/816/0/2 full ; 43 tests ciblés finaux et build/différentiel PASS (32 diagnostics hérités). Parents H03.3/H03.4/H06.4/H08.3 et harness global restent IMPLEMENTING ; aucun critère parent promu.

Gestion Git affinée : [AGENT-GIT.md](AGENT-GIT.md), H06.3a → b → c → d, TODO. Aucun worktree pour consultation ; isolation des écritures, intégration vérifiée, récupération et coût mesuré. Runtime encore à implémenter.

## H06.3a — checkpoint 2026-10-02

Inventaire Git read-only et décision controller-owned implémentés dans agent-git.ts, sans création ni branche ni integration runtime. [EV-AGENT-GIT-INVENTORY](evaluation/agent-git/evidence.md) : 4 nouveaux tests Git réel,37 ciblés,823/821/0/2 full final ; build/différentiel PASS32 diagnostics hérités. H06.3a DONE borné ; H06.3b/c/d TODO, parent H06.3 et global IMPLEMENTING. Création/reprise/admission/intégration/cleanup restent à livrer.
