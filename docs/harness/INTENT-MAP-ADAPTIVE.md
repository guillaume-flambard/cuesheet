# Intent, Project Map et exécution adaptative

Statut : spécification ; aucune capacité nouvelle déclarée implémentée. Source : trois textes fournis par le propriétaire le 2026-10-02. Cette extension poursuit HARNESS FIRST et le backlog existant, sans remplacer le contrat produit.

## Résultat et architecture

Dépôt inconnu → probe locale → carte sourcée → intention structurée → impact → faisabilité → paquet → exécution → preuve → réconciliation. La boucle observe ensuite les nouvelles découvertes et adapte contexte, budget, modèle et agents. La conversation est une entrée ; journaux et records structurés restent la source de vérité.

Réutiliser objectifs/plans, sessions/journaux, mémoires, router providers, workers privés, intégration et state graph. Le schéma graphe v1 actuel ne contient pas les kinds intent/decision/data/outcome : définir une extension versionnée ou des références typées vers records existants, avec migration explicite, plutôt qu’injecter des kinds incompatibles. Les données sensibles runtime restent hors manifeste Git partagé. Relations descriptives et invalidation doivent être distinguées.

JEV et World Kernel ne sont pas des prérequis. Une future intégration JEV serait une capacité spécialisée soumise aux mêmes contrats et autorisations ; aucun résultat de modèle ou de JEV n’est une preuve owner par défaut.

## Données et transitions

Intent : identité stable, auteur et autorité, outcome, why, contraintes, critères référencés, hypothèses sourcées, conflits, priorité, révision et historique. Relier au goal existant. Proposition, acceptation, révision, suspension et satisfaction sont des transitions tracées ; la machine ne fabrique pas une acceptation humaine.

ProjectMap : capture/révision, root autorisé, collecteurs/version, nœuds et relations avec sources/digests, couverture, inconnues, frontières et diagnostics. Extractions déterministes distinctes des hypothèses sémantiques. Un adapter absent ou une relation dynamique non résolue reste UNKNOWN. Aucune commande package/install/migration découverte n’est exécutée par la probe.

ExecutionState : références d’intention/contexte, état courant, evidence, risques/inconnues, stratégie motivée, modèles/capacités autorisés, unités actives, compteurs et réservations de temps/tokens/coût/contexte/concurrence. Événements idempotents et CAS alimentent la projection ; crash et cancellation réconcilient les réservations sans effacer les dépenses. Prix et tokens non disponibles restent inconnus. L’estimation de confiance LLM est une hypothèse, jamais une permission.

## Admission, UX et autonomie

Déterministe avant probabiliste, local avant global, escalade motivée par observations. Le rôle et le modèle restent séparés ; préférence humaine conservée. Scope supplémentaire déjà autorisé et prouvé peut être admis automatiquement ; changement de contrainte humaine, droits, coûts ou effet non autorisé exige une décision adaptée. Ne pas ajouter un Y/N systématique à chaque expansion du graphe.

La limite de temps est optionnelle et propre à l’exécution. Elle ne fait pas expirer le goal et ne permet pas d’annoncer un travail non vérifié terminé. Réserver une tranche de vérification ; réduire exploration/refactor optionnels sous pression. Arrêt humain prioritaire. Date/timezone pour situation, horloge monotone pour durées, état reprenable après restart.

Interface progressive : intention, carte/impact, inconnues utiles, stratégie/raison, budget connu ou inconnu, phase et preuves ; détails au clavier avec sources. `cuesheet map` fonctionne aussi sans provider. Intention naturelle sans commandes internes obligatoires. Le chemin intent→execute peut rester automatique selon autorisation existante, sans imposer un mode manuel à toute tâche.

## Périmètre et vérification

Première tranche : probe générique manifests/Git/docs/checks, Node/TypeScript et imports, un cas framework contractuel documenté. Adonis/Nest/React/Prisma/Lucid/Drizzle/etc. sont une liste d’adapters potentiels, pas des supports déjà acquis. Ajouter chacun selon fixtures et besoin de parcours ; pas une matrice de 40 frameworks sur le chemin critique. Pas de graphe distribué ou vecteurs requis.

Vérifier invalid inputs, grands repos, Unicode/symlinks, secrets, source modifiée, carte partielle, cycle, relation inconnue, cache périmé, contradiction humaine, révision pendant inference/outil, stop, crash, budget concurrent, usage inconnu, provider indisponible, override et migration. Oracles externes : résultat fonctionnel et compatibilité, jamais le résumé de l’agent. Raccord contrats/mocks existant SG05 plutôt que deuxième générateur.

Benchmark : comparer la probe sans LLM puis la boucle adaptative à une configuration fixe sur les mêmes captures/intents/checks. Publier latence initiale et totale, mémoire, bytes/context, appels, tokens réels vs estimés, coût connu/inconnu, agents, succès et échecs, avec environnements et répétitions. Fixer les seuils de latence et réserves dans une fixture/politique owner avant les runs ; « quelques secondes » reste un objectif à mesurer, pas un résultat déclaré. Ne jamais gagner du temps en supprimant les checks requis.

## Risques et gates

Risques élevés à résoudre avant livraison : carte incomplète qui sous-sélectionne les checks ; dérive intention/scope ; allocations parallèles qui dépassent le budget ; provenance sensible exposée au mauvais scope. Mitigations : couverture inconnue et validation conservatrice, admission par révision/autorité, réservations atomiques, grants avant sélection/lecture. Cibles de preuve : fixtures adversariales, crash/replay, composition réelle et parcours installé. Aucun risque ne se ferme avec ce document.

Gates : specs/paquets → tests ciblés → intégration série → review indépendante → parcours installé dépôt inconnu → providers réels autorisés → comparaison benchmark → acceptation manuelle. Bloquer seulement les branches dépendantes d’une inconnue ; conserver les autres branches exécutables.

## Tâches et critères

### IR01 — Intention structurée et provenance

REQ-IR01 / AC-IR01 : Une intention conserve ID, acteur/owner, outcome, rationale, contraintes, critères, priorité, hypothèses et révision ; reformulation conserve ID, correction produit une révision et migration préserve les originaux.

Dépendances : H01.1. Statut TODO ; preuve PENDING.

### IR02 — Relations intention → décision → réalité → preuve

REQ-IR02 / AC-IR02 : Chaque lien intent/decision/domain/contract/implementation/data/proof/outcome est typé, sourcé et adressable ; pourquoi/qui/quoi/prouve remontent dans les deux sens avec permissions. Les goals existants ne sont pas dupliqués.

Dépendances : SG01.2. Statut TODO ; preuve PENDING.

### IR03 — Conflits et faisabilité sourcés

REQ-IR03 / AC-IR03 : Les statuts FEASIBLE, FEASIBLE_WITH_CONSTRAINTS, UNKNOWN, CONFLICT, BLOCKED renvoient contraintes, sources et inconnues ; une hypothèse LLM ne devient ni fait ni autorisation ; conflits/compatibilité/migration/ownership/capacités/rollback sont évalués sans score magique.

Dépendances : IR02. Statut TODO ; preuve PENDING.

### IR04 — Réconciliation continue et intent drift

REQ-IR04 / AC-IR04 : Impact attendu et diff réel sont comparés avant effet/intégration/clôture ; domaines hors scope sont expliqués par sources ou refusés. Une correction R+1 invalide plan/preuves/sorties R et rafraîchit directement les agents.

Dépendances : IR03, SG02.3, SG06.2. Statut TODO ; preuve PENDING.

### IR05 — Projection bidirectionnelle et acceptation

REQ-IR05 / AC-IR05 : Humain et agents retrouvent intentions, décisions, découvertes, inconnues et résultats dans un état commun adressable ; permissions respectées et preuves courantes exigées pour annoncer satisfaction.

Dépendances : IR04. Statut TODO ; preuve PENDING.

### PM01 — Probe locale déterministe bornée

REQ-PM01 / AC-PM01 : Un dépôt inconnu produit manifests/langages/structure/diff Git/checks/docs avec provenance, couverture et inconnues ; aucune exécution de scripts du dépôt pendant discovery, aucune lecture de secrets ou traversée symlink hors scope.

Dépendances : SG01.2. Statut TODO ; preuve PENDING.

### PM02 — Modèle universel et adapters de découverte

REQ-PM02 / AC-PM02 : Une interface adapter versionnée collecte relations code/données/contrats/CI avec sources/digests et certitude explicite ; première tranche Node/TypeScript et imports, adapter non supporté déclaré, aucune inférence de domaine affirmée comme fait.

Dépendances : PM01. Statut TODO ; preuve PENDING.

### PM03 — cuesheet map et exploration progressive

REQ-PM03 / AC-PM03 : CLI et intention naturelle exposent carte sourcée et why ; cache invalidé par captures, frontière/relations dynamiques inconnues explicites ; extension ciblée bornée, annulation et reprise préservent état.

Dépendances : PM02. Statut TODO ; preuve PENDING.

### PM04 — Raccord carte → impact → paquet

REQ-PM04 / AC-PM04 : Carte observée alimente le graphe validé sans déclarer couverture complète ; intention normalisée sélectionne voisinage, contraintes, questions essentielles, fichiers attendus et checks owner. Génération de carte ne confère aucun droit.

Dépendances : PM03, SG02.3, IR01. Statut TODO ; preuve PENDING.

### PM05 — Parcours dépôt inconnu installé

REQ-PM05 / AC-PM05 : Sur fixtures inconnues Node/TypeScript dont un cas framework et une feature status-transition : carte, clarification utile, impact, exécution, correction, preuve, réconciliation et reprise sont vérifiés avec sources ; temps/tokens mesurés, pas de chiffres de démo inventés.

Dépendances : PM04, IR04, SG09.2. Statut TODO ; preuve PENDING.

### AE01 — ExecutionState et budget cumulatif

REQ-AE01 / AC-AE01 : État versionné lie intention/révision, compréhension, risques, frontières, stratégie, routes, agents, evidence et ressources ; compteurs mesurés/estimés/inconnus distincts, allocations atomiques empêchent dépassement concurrent et replay double comptage.

Dépendances : H05.5. Statut TODO ; preuve PENDING.

### AE02 — Budget temps et réserve de vérification

REQ-AE02 / AC-AE02 : --budget et intention naturelle définissent une enveloppe optionnelle ; durée monotone pour mesure, UTC/timezone pour affichage ; réserve vérification/buffer configurable, pression réduit travail optionnel, expiration suspend effets et laisse objectif reprenable.

Dépendances : AE01. Statut TODO ; preuve PENDING.

### AE03 — Routage adaptatif autorisé

REQ-AE03 / AC-AE03 : Unité de travail choisit outil déterministe ou route autorisée selon capacités et observations ; escalation/downgrade sourcés à frontière sûre, override humain persiste, aucun fallback payant ou capacité/prix inventé.

Dépendances : AE01. Statut TODO ; preuve PENDING.

### AE04 — Contexte et agents élastiques

REQ-AE04 / AC-AE04 : Frontière de contexte progresse sur besoin sourcé ; parallélisme seulement pour unités indépendantes avec budgets atomiques et scopes disjoints ; résultats structurés claim/evidence/implications/unknowns remplacent copie de conversations, relais reprend la question non résolue sans perdre contraintes.

Dépendances : AE03, SG06.1, H06.2c1. Statut TODO ; preuve PENDING.

### AE05 — Boucle adaptative et benchmark

REQ-AE05 / AC-AE05 : OBSERVE/MAP/ASSESS/BUDGET/ROUTE/ACT/MEASURE/RECONCILE est raccordé au runtime ; changement risque/temps/révision replanifie sans queue ; cas MICRO/STANDARD/SYSTEM, stop/crash/provider indisponible et modèles réels vérifient qualité/coût/latence sans optimiser au détriment des preuves.

Dépendances : AE04, AE02, PM05. Statut TODO ; preuve PENDING.

