# State graph — plan d’implémentation Cuesheet

Statut : PLANNED pour ce chantier ; produit global IMPLEMENTING. Ce document est une spécification, pas une annonce de fonctionnalités livrées.

## Intention et raccord à la roadmap

Transformer une intention en tâche durable, calculer ses conséquences et vérifier les invariants des domaines concernés. Le graphe sert le harness autonome et son autodéveloppement ; il ne devient pas une application de gestion à configurer manuellement à chaque feature.

Réutiliser `work-plans.ts` (identités/DAG), `objectives.ts` (contrat/révision/check), `terminal-session.ts` et `session-store.ts` (journal/claim/replay), `shared-context.ts` (contexte borné), les mémoires/Vault et `surface-verification.ts` (preuves indépendantes). Les workers et leur intégration existants restent les exécuteurs. Adapter autour de `src/core`, sans modification de ce noyau dans la première tranche.

## Contrat v1 du graphe

- Source initiale : `.cuesheet/project/graph.json` versionnée dans Git ; moteur TypeScript, aucune nouvelle base ni dépendance YAML obligatoire. Les données runtime sont des records hors Git, avec références vers ce manifeste.
- Node : `id`, `kind`, `domainId`, `revision`, `sourceRefs`, `ownerRef`, `contractRefs`, `invariantRefs`, `checkRefs`. Kinds : domain/entity/contract/source/invariant/test/ci. IDs indépendants des chemins, références de contenu avec digest et provenance.
- Edge : `id`, `type`, `dependent`, `dependency`, `sourceRef`. Types affectant la validité : depends_on/implements/validates. contains et describes sont descriptifs : ils ne propagent pas implicitement une invalidation. Les règles par type sont versionnées.
- Sens : si A dépend de B, un changement de B invalide A et tous ses dépendants transitifs. Un domaine est agrégé via les dépendances de ses invariants, pas par un edge de containment inventé.
- Cycles de dépendance possibles : SCC + fermeture itérative finie ; tous les membres concernés sont invalidés. Un cycle du DAG d’exécution des tâches reste refusé. Limites v1 : 10 000 nœuds, 50 000 edges, 2 MiB de manifeste ; dépassement explicite, aucune troncature silencieuse.
- Hash canonique de la définition normalisée ; IDs/edges triés, ensembles normalisés, ordre des listes sémantiques conservé. Révision de fichier Git seule insuffisante : le contenu dirty est couvert. Chemins relatifs canoniques, symlinks/escapes refusés.
- Permissions avant recherche et lors de lecture ; un graphe, document, contrat ou plugin ne peut accorder une capacité. Commandes exécutables et droits viennent du registre owner séparé.

## Invalidation, preuves et progression

Le moteur calcule des seeds depuis changements de sources, contrats, invariants, manifestes ou décisions structurées, puis une fermeture monotone, triée, avec chaînes de raisons. Suppressions/renommages utilisent anciens et nouveaux mappings. Un fichier inconnu ou une couverture incomplète élargit vers les checks baseline owner du périmètre autorisé ; impossible de déclarer un succès exhaustif sur un impact vide non justifié.

Une preuve lie nodeId, capture/source digest, graphRevision, contractDigest, invariant/check digest, contexte et verdict. Changement d’une dépendance émet une invalidation ; anciennes preuves restent consultables, sans réattribution à la nouvelle révision. Le résultat compilé n’est qu’un check parmi les autres.

Une tâche lie taskId/objectiveId, exigences, scopes, critères, dependencies, contextRevision, phase et références de preuves. State.json/projection structurée est la source de progression ; le journal fait foi si un checkpoint diverge. DONE exige critères courants vérifiés et absence de dépendance invalidée. READY_FOR_MANUAL_ACCEPTANCE reste l’état final contrôlé par le harness lorsqu’une acceptation humaine est requise.

Les enveloppes sont portées par les adapters et les payloads versionnés ; les champs existants seq/at/kind/subject/data restent compatibles et les anciens événements sont migrés explicitement, sans réécrire leur auteur. Les actions métier/admissions/observations émettent des événements : eventId, streamSeq, schemaVersion, actor, taskId, objectiveRevision, contextRevision, causationId, correlationId, idempotencyKey, payload et source/evidenceRefs. L’ordre fait foi par séquence/CAS, pas par date. Ne pas journaliser chaque token ni secret ; bornes/rétention explicites. Pas de transaction atomique inter-stream revendiquée : liens de causalité et reprise idempotente.

## Contrats, mocks et contexte

Contrats structurés initialement explicites : champs/types/contraintes/erreurs/exemples et version. Le schéma supporté est borné et documenté ; expression non supportée refuse la génération. Mocks dérivés avec générateur versionné + contrat digest + seed, sans autorité d’acceptation. Des tests indépendants comparent l’implémentation réelle au contrat ; un mock conforme ne prouve pas un backend conforme. Compatibilité structurelle ne garantit pas compatibilité métier : invariants et revue restent requis.

contextRevision identifie le graphe, le contrat d’objectif, les sources/scopes et les révisions de mémoires utilisées. Un sous-graphe contient tâche, critères, dépendances utiles, invariants, checks et références sourcées ; budget strict, pas de dump du dépôt ni de mémoire globale. Relecture avant admission d’effet et preuve ; si changement, refresh direct dans la même exécution, anciennes inférences écartées, effets confirmés conservés. Les corrections humaines priment. Ce mécanisme étend les gardes actuelles, sans introduire de message queued.

## API ciblée et couche MCP

| Opération | Entrée principale | Résultat / autorité |
| --- | --- | --- |
| get_domain_model | domainId, expectedGraphRevision, cursor | Sous-graphe autorisé, sources, nextCursor ; jamais le graphe global par défaut |
| get_current_contract | nodeId/taskId, expectedContextRevision | Contrat courant + digest/provenance, erreur stale si attendu différent |
| get_impacted_nodes | taskId ou changeSetRef, expectedGraphRevision | Seeds/closure/reasons + unknownCoverage ; borné/paginé |
| get_required_tests | impactPlanId/digest | Checks/invariants/jobs owner requis ; aucune commande venant du modèle |
| propose_change | taskId, contextRevision, patchRef/intention, idempotencyKey | Proposition sourcée ; aucun effet ni changement canonique implicite |
| record_progress | taskId, expectedTaskRevision, contextRevision, transition, evidenceRefs, idempotencyKey | Append conditionnel et nouvel état ; statut vérifié seulement depuis preuves owner valides |

Les opérations read refusent un expected digest obsolète ; write échoue en conflit, sans rebase silencieux. Le harness rafraîchit/repropose depuis le contexte courant. Actor issu du transport/capability owner, jamais accepté du payload modèle. Le transport MCP expose ces mêmes services TypeScript, sans logique métier parallèle ni ouverture universelle de droits.

## CI et UX

Le plan CI est un artefact déterministe liant changeSet/graphRevision/check catalog digest et raisons de sélection. Les jobs exécutent des commandes déclarées par owner, avec captures et receipts. Changement des sélecteurs, checks, manifestes, configuration CI ou moteur exige la baseline complète. Graphe invalide : baseline owner sûre ou clôture refusée, jamais skip vert. Comparer régulièrement sélection ciblée et validation complète pour détecter la sous-couverture.

Le terminal décide automatiquement quand produire/mettre à jour une tâche et son impact ; affichage compact : ce qui change, pourquoi, invariants invalidés, prochains checks et progression sourcée. Details à la demande, clavier/resize, états chargement/vide/erreur/stale. Aucun onglet obligatoire par domaine. Pas de chiffres de tokens/prix inventés.

## Epics, exigences et critères

### SG01 — Graphe canonique versionné

**REQ-SG01** : Un manifeste JSON validé décrit domaines, entités, contrats, sources, invariants, tests et jobs CI avec IDs stables et références résolues.

**AC-SG01** : Charger un graphe valide puis références absentes, IDs dupliqués, version inconnue et chemin hors racine ; les erreurs refusent admission avant effet.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG01.1 | P0 | — | Schéma JSON v1, IDs stables, kinds, edges typés et validation bornée |
| SG01.2 | P0 | SG01.1 | Loader TypeScript, hash canonique, provenance et migration explicite |
| SG01.3 | P0 | SG01.2 | Manifeste initial Cuesheet : sessions, objectifs, workers et intégration |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG02 — Impact déterministe

**REQ-SG02** : Chaque changement produit la fermeture transitive des dépendants et ses raisons ; ajout, suppression, renommage, cycles et fichiers inconnus sont traités sans impact vide trompeur.

**AC-SG02** : Même entrée/révision donne même plan et mêmes raisons ; diamant/cycle/suppression/renommage/fichier inconnu et limites sont testés.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG02.1 | P0 | SG01.2 | Index inversé, fermeture itérative et composantes fortement connexes |
| SG02.2 | P0 | SG02.1, SG01.3 | Mapping diff dirty/commit vers seeds, suppression et couverture inconnue |
| SG02.3 | P0 | SG02.2 | Plan adressable impactedNodes/invariants/tests/jobs, tri stable et cache par digest |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG03 — Invariants de domaine

**REQ-SG03** : Les invariants ont un propriétaire, des sources et des vérifications ; résultat inconnu ou périmé ne vaut pas succès.

**AC-SG03** : Un résultat compilation PASS avec invariant FAIL laisse le domaine non validé ; changement dépendant invalide les preuves sourcées.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG03.1 | P0 | SG01.3 | Registre déclaratif des invariants et liaisons vers checks owner |
| SG03.2 | P0 | SG03.1, SG02.3 | Runner déterministe et preuves liées aux captures/contrats courants |
| SG03.3 | P1 | SG03.2, SG04.2 | Invalidation événementielle des preuves et revue humaine sourcée |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG04 — État événementiel des tâches

**REQ-SG04** : Les événements métier reconstruisent tâches, décisions, invalidations et progrès ; un résumé de chat ne modifie ni état ni autorité.

**AC-SG04** : Replay après crash et checkpoint égale projection sans checkpoint ; doublon/CAS périmé/record tronqué refusés, historique conservé.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG04.1 | P0 | SG01.2 | Enveloppes événementielles avec actor/causation/context/evidence et idempotencyKey |
| SG04.2 | P0 | SG04.1 | Projection par taskId, transitions et append conditionnel ; migration des plans existants |
| SG04.3 | P1 | SG04.2 | Checkpoints reconstruisibles, adressage des références et tests crash/replay |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG05 — Contrats et mocks compatibles

**REQ-SG05** : Les contrats versionnés produisent fixtures/mocks déterministes ; consommateurs et implémentation réelle sont vérifiés indépendamment des mocks.

**AC-SG05** : Un mock passe mais le backend réel diverge : compatibilité FAIL ; changement breaking et seed identique ont des résultats reproductibles.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG05.1 | P0 | SG01.3 | Références de contrats et règles de compatibilité, sans remplacer les objectifs existants |
| SG05.2 | P1 | SG05.1 | Génération bornée des mocks/fixtures depuis contrat et seed explicite |
| SG05.3 | P0 | SG05.2, SG03.2 | Tests consommateur/mock et implémentation réelle, détection du drift |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG06 — Contexte ciblé et révision

**REQ-SG06** : Chaque tâche reçoit un sous-graphe autorisé et une empreinte de contexte ; dérivation obsolète est refusée avant effet puis rafraîchie directement.

**AC-SG06** : Correction pendant inférence/outil conserve les effets confirmés mais refuse la prochaine action obsolète ; aucun message queued ni session remplacée.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG06.1 | P0 | SG02.3, SG04.2 | Compilation de sous-graphe borné, sources et permissions avant sélection |
| SG06.2 | P0 | SG06.1 | Binding contexte aux tâches/agents, contrôle avant effet et refresh direct |
| SG06.3 | P1 | SG06.2, SG04.3 | Reprise inter-modèle et historique ciblé, mesures taille/latence/tokens connus |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG07 — API et exposition MCP

**REQ-SG07** : Six opérations exposent modèles, contrats, impact, tests, propositions et progrès ciblés ; les écritures sont conditionnelles et ne peuvent déclarer une réussite sans preuve.

**AC-SG07** : Identité sans droits, contexte périmé et progression DONE sans preuve refusés ; get ciblé ne divulgue aucun nœud inaccessible ni charge globale.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG07.1 | P0 | SG06.1, SG05.1 | API TypeScript typed : six opérations et erreurs/pagination/révisions |
| SG07.2 | P1 | SG07.1, SG06.2 | Transport MCP branché au registre owner de capacités/autorisations |
| SG07.3 | P1 | SG07.2, SG04.3 | Tests protocole/permissions/limites/CAS et audit de propositions non autoritaires |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG08 — CI dérivée du graphe

**REQ-SG08** : Le graphe génère un plan CI exécuté par des commandes owner ; configuration et sous-couverture déclenchent vérification élargie, jamais un faux plan vert.

**AC-SG08** : Diff ciblé sélectionne les checks attendus ; manifest/check/CI changés, graphe invalide ou fichier inconnu force baseline owner complète ou refuse clôture.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG08.1 | P0 | SG02.3, SG03.1 | CLI impact/required-tests/ci-plan avec JSON déterministe |
| SG08.2 | P1 | SG08.1, SG05.3 | Raccord CI, catalogue owner et receipts par révision/capture |
| SG08.3 | P0 | SG08.2 | Comparaison sélection/validation complète et tests de sous-couverture |

Preuves : pending. Statut : TODO (SG01.1 READY).

### SG09 — Expérience terminal et évaluation

**REQ-SG09** : Le terminal montre état réel, impact, raisons et validations requises sans imposer une configuration manuelle systématique.

**AC-SG09** : Parcours feature→impact→workers→check→reprise fonctionne au clavier, après resize/crash et changement modèle ; dépenses/latences inconnues restent explicites.

| Tâche | Priorité | Dépendances | Implémentation |
| --- | --- | --- | --- |
| SG09.1 | P1 | SG06.2, SG08.1 | Vue tâche/impact/invariants avec sources, états pending/failed/stale |
| SG09.2 | P0 | SG09.1, SG07.3, SG08.3 | Parcours Cuesheet installé avec workers/revalidation/contrat et reprise |
| SG09.3 | P1 | SG09.2, SG06.3 | Benchmarks et audit adversarial complet, checklist acceptation humaine |

Preuves : pending. Statut : TODO (SG01.1 READY).

## Ordre d’exécution

Première tranche verticale : SG01 → SG02, SG04.1/2, SG03.1/2 → SG06.1/2 → SG08.1 → SG09.1. Démonstrateur limité aux domaines sessions/objectifs/workers/intégration de Cuesheet. Ensuite contrats/mocks, exposition MCP et CI complète, puis évaluation du parcours installé. Les dépendances du tableau définissent le graphe exact ; ne pas annoncer la feature complète sur la seule première tranche.

La reprise crash et la validation LLM réelle déjà ouvertes dans la roadmap restent nécessaires à l’autodéveloppement complet. Ce nouveau chantier ne les remplace pas.

## Risques et vérification

- R-SG1 HIGH : mapping incomplet produit fausse absence d’impact. Inventaire, inconnus conservateurs, fixtures mutation et comparaison full/ciblé. OPEN.
- R-SG2 HIGH : graph/contrat/progress falsifié accorde autorité ou preuve. Registre owner séparé, provenance/CAS/permissions, tests payload malveillant et MCP. OPEN.
- R-SG3 HIGH : preuves périmées acceptées après correction/crash. Tuple contexte/captures, invalidation/replay/admission, tests deux agents et interruptions. OPEN.
- R-SG4 MEDIUM : mocks couplés aux tests masquent une divergence réelle. Validation indépendante des implémentations et invariants métier. OPEN.
- R-SG5 MEDIUM : fermeture/contextes explosent en coût. Bornes, moteur itératif, cache digest reconstructible et benchmarks. OPEN.

Vérification : schémas/fixtures → moteur déterministe/property cases → replay/CAS/pannes → contrats indépendants → API/MCP/permissions → sélection CI vs full → terminal installé/PTY → audit adversarial et acceptation humaine. Chaque tâche conserve commandes, résultat, version et capture ; aucune preuve de session seule. Seuils de performance à fixer depuis baseline avant SG06.3, pas de promesse arbitraire.

Couverture : persistance, concurrence, intégrité, annulation, reprise, permissions, privacy, performance, offline local, cache, migrations, contrats, CI, diagnostics et accessibilité applicables. Auth multi-machine/transport distribué restent au chantier entreprise existant ; pas revendiqués par un MCP local. Déploiement externe N/A à cette phase de spécification. Rollback : revert du manifeste/moteur ; journal conservé, migration explicite pour replay, aucun effacement de preuves.

## Différé explicitement

Indexation automatique des sources et suggestions de liens : P2 après mesure de précision/couverture ; liens proposés doivent être validés. YAML : P2 si besoin réel, même schéma normalisé. Base graphe et index vectoriel : P3, seulement si benchmarks justifient ; reconstruisibles depuis sources canoniques, droits identiques, jamais sources de vérité. Aucune de ces options ne bloque la première version.

## Points d’implémentation prévus

Moteur/schémas/API : `src/adapters/state-graph/` ; CLI au niveau adapters/surface existant ; tests `test/state-graph*.test.ts`. Raccordements ciblés aux plans/objectifs, shared-context, producer/runtime et pipeline CI existants. Ces chemins décrivent la cible, aucun module n’a été créé par ce lot de spécification. Les systèmes exacts et seuils sont affinés avant chaque tâche, sans toucher `src/core` pour la première tranche.

Revue de plan du 2026-10-02 : JSON state.json parse,27 IDs/requis/critères liés, dépendances acycliques et aucun faux DONE vérifiés ; diff check PASS. Tests runtime non applicables à ce lot documentaire.

## SG01.1 — format strict retenu avant implémentation

JSON v1 exact : {version:1,nodes:[],edges:[]}. Node : id/kind/domainId/revision
(entier positif), sourceRefs:[{path,digest}], ownerRef (identifiant, pas droit),
contractRefs/invariantRefs/checkRefs (IDs vers kind contract/invariant/test|ci).
Domain node a domainId égal à son propre ID ; autres nodes pointent un domain.
Edge : id/type/dependent/dependency/sourceRef:{path,digest}. depends_on,
implements,validates,contains,describes sont les seuls types v1. Identifiants
ASCII stables ≤128 caractères, références uniques et tous endpoints résolus.
Nodes/edges bornés à10k/50k,JSON UTF-8≤2MiB, champs inconnus refusés.
Chemins de sources relatifs portables, sans traversal/segments ambigus, Git
metadata ou credentials ; digest SHA256. Aucun contenu executable/droits dans
ce format. Validation structurelle uniquement, pas preuve de vérité des hashes,
de couverture du dépôt ni autorisation owner. Cycles de dépendances acceptés
pour SCC ultérieur ; self edge refusé comme définition dégénérée. Le résultat
est détaché et gelé, aucun fichier lu/écrit par le validateur.
Vérification : références/types/malformed/borne/chemins/cycles/immutabilité et
compatibilité build ; moteur impact, hash et loader restent SG01.2/SG02.

## SG01.2 — loader et empreinte v1

loadStateGraph(rootOwner) lit uniquement .cuesheet/project/graph.json sous une
racine owner canonique ; parents/sources symlink, fichier spécial/hardlink,
manifest >2MiB et lecture modifiée refusés. Le loader ne charge ni tous les
fichiers sources ni un document distant. Digest brut du manifeste + empreinte
sémantique normalisée retournés avec chemin canonique. L’ordre des nodes,edges
et listes de refs est non sémantique et trié avec comparateur ordinal ; aucun
localeCompare ni horloge dans revision. Normalisation indépendante des clefs
et espaces JSON. Hash des sourceRefs déclaré seulement, pas validé comme
preuve de fichier par ce loader. Format nouveau v1, aucune ancienne définition
à migrer ; version inconnue refusée explicitement, pas de migration inventée.
Fixtures : ordre/whitespace stable, changement de contrat/edge sensible,
lecture réelle, symlink/escape/hardlink/absent/corrompu refusés, bornes.
