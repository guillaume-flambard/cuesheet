# Entraide universelle, choix du modèle et état central

Statut : PLANNED. Exigence propriétaire du 2026-10-03. Aucun mécanisme décrit
ci-dessous n'est déclaré livré par ce document.
Source canonique de cette tranche : H06.8 (entraide), AE03 (routage), master
sections 15, 19, 21 à 25, 31 et 32. Ce document précise ces tâches existantes.

## Résultat attendu

Tout agent peut demander de l'aide, contribuer à une autre tâche et demander
une capacité de modèle adaptée. Le travail conserve son identité lorsque le
modèle change. Les découvertes et les résultats de routage nourrissent l'état
central, puis les agents concernés. L'humain ne coordonne pas les échanges.

Le cœur central est l'état durable partagé et ses contrôleurs. Un coordinateur
LLM peut l'utiliser ; sa conversation ne constitue pas une seconde vérité.
« Meilleur modèle » signifie adapté au besoin, disponible et compatible avec
les contraintes, selon les observations connues. Aucun classement universel
ni score de qualité inventé à partir du nom du modèle.

## État observé et flux actuel

- agent-consultation.ts : 1 à 3 consultants texte sans outils, appelés par le
  coordinateur, résultats dans terminal.agent.
- code-worker-loop.ts : workers isolés, consultation interdite actuellement.
- agent-models.ts : choix humains par rôle et héritage, sans routage adaptatif.
- model-catalog.ts : IDs/noms disponibles ; pas de preuve de qualité, prix,
  disponibilité effective ou compatibilité observée.
- model-usage.ts : reçus de consommation ; coût inconnu reste inconnu.
- shared-context.ts et journaux : projections sourcées et bornées existantes.

Flux cible : agent demandeur > admission centrale > besoin/candidats/ressources
> pair pertinent ou helper > résultat sourcé > état central > destinataires
pertinents > prochaine frontière d'inférence. La réponse au demandeur et la
mise à jour centrale proviennent du même événement durable.

## Contrats et critères d'acceptation

AR01 Universalité : coordinateur, worker de code, consultant, reviewer et helper
ont accès au même protocole d'aide. Chaque type est exercé par un test de contrat.
Aucun changement du périmètre de fichiers ou des permissions par entraide.
Le worker CLI historique est aussi raccordé, ou son absence bloque AR01.

AR02 Aide ciblée : demande identifiée avec agent, tâche/intention et révision,
question, blocage, résultat attendu, sources accessibles et budget restant.
Réutiliser un résultat frais ou un pair pertinent avant de créer du travail.
Le helper restitue constat, sources, implications, limites et inconnues.
Les demandes concurrentes équivalentes sont coalescées ; pas de double dépense.

AR03 Modèle interchangeable : l'agent exprime son besoin et peut proposer une
route. Le contrôleur choisit parmi les routes configurées et admissibles à cet
usage, avec capacités connues, résultats récents, format respecté, latence,
consommation observée et contraintes humaines. Il conserve identité, travail,
contexte, reçus et preuves. Un choix humain explicite garde sa priorité.
Flash reste le défaut initial demandé ; le défaut global n'est pas réécrit.
L'autorisation de tester une route alternative n'autorise pas un achat ni une
nouvelle connexion. Coût inconnu, capacité inconnue et qualité inconnue restent
explicites. Un simple succès de réponse ne prouve pas une aptitude au code.

AR04 Apprentissage central : chaque demande, affectation, changement de route,
réponse et résultat de validation porte auteur, sources, révision, modèle,
statut épistémique et invalidateurs. Une réponse de helper est INFERRED,
un reçu d'exécution OBSERVED ; aucune promotion par consensus des agents.
Les expériences de routage distinguent refus quota/auth, format invalide,
latence, échec d'outil et preuve métier, sans attribuer tout échec au modèle.
Les découvertes réutilisables persistent dans le scope World/Project adéquat ;
les détails privés restent dans leur scope, référencés plutôt que diffusés.

AR05 Distribution utile : un agent reçoit les deltas pertinents pour sa tâche
à la prochaine frontière sûre. Déduplication par identité/révision, accusé de
consommation durable et lecture bornée des sources. Pas de broadcast des chats.
Une source changée rend le constat périmé et retire son influence sur le routage.
Une correction humaine invalide les aides concernées avant effet.

AR06 Ressources et reprise : budget collectif d'appels/temps, limite de helpers
actifs et profondeur, détection des cycles A>B>A, backpressure par fournisseur.
Tout agent peut demander de l'aide ; une limite produit un état différé ou refusé
explicite, pas un contournement. Le scheduler ne garde pas un slot de calcul en
attendant un helper, pour éviter l'interblocage. Stop annule les nouvelles
admissions et les inférences ; les effets confirmés restent conservés.
Après redémarrage : résultat durable réutilisé, inférence interrompue signalée,
effet incertain jamais rejoué automatiquement. Les identifiants assurent
l'idempotence ; aucune écriture des journaux d'un pair par un modèle.

AR07 Lisibilité : le flux et /agents montrent qui aide qui, la question utile,
le modèle choisi et sa raison, puis ce qui a changé dans la compréhension
commune. Détails et sources à la demande, saisie toujours disponible.
Vérifier le terminal installé et les quatre tailles de la direction existante.

## Modèle de données et compatibilité

Événements additifs versionnés : assistance.requested/admitted/deferred/result/
failed/cancelled/stale, model.route-selected/outcome et knowledge.delta.
Enveloppe : id, requestId, parentRequestId, agentId, taskId, objectiveRevision,
scope, sourceRefs, createdAt, budget, état ; champs de résultat qualifiés.
Les schémas définitifs doivent réutiliser les identités existantes après lecture
complète des journaux concernés. Aucune migration destructive. Anciennes
consultations restent affichables sans leur inventer une validation.

## Graphe fini de réalisation

- AR-T01 P0 TODO : contrats/événements/projections/reprise, dépendances H06.8.
- AR-T02 P0 TODO : admission et scheduler d'aide commun, dépend AR-T01.
- AR-T03 P0 TODO : capacité commune raccordée à tous les types d'agent,
  dépend AR-T02 ; vérifier notamment consultants et worker CLI.
- AR-T04 P0 TODO : candidats admissibles, décisions de routage et retour
  d'expérience partagé avec backpressure, dépend AR-T01/AE03 et budget AE01.
- AR-T05 P0 TODO : publication centrale, fraîcheur et distribution ciblée,
  dépend AR-T01/AR-T03/AR-T04 ; persistance inter-session et isolation des scopes.
- AR-T06 P1 TODO : affichage dans le flux et inspection, dépend AR-T03/AR-T05.
- AR-T07 P0 TODO : parcours intégré installé et audit adversarial,
  dépend AR-T01 à AR-T06. Aucun statut DONE sans preuves.

## Vérification et risques

Scénario central : A écrit sur une copie, demande l'avis de B ; B peut demander
une aide ciblée à C ; le contrôleur choisit les capacités selon des observations
connues, publie les résultats qualifiés ; D reçoit le delta pertinent. Changer
le modèle de A préserve son identité et ses reçus. Une correction humaine au
milieu rend les anciens résultats inapplicables. Reprise sans doublon.

Scénarios adversariaux : cycle, doublon simultané, quota collectif, tous les
modèles refusés, réponse mal formée, coût inconnu, faux score de qualité, source
périmée, tentative de fuite inter-projets, preuve absente, arrêt pendant effet,
journal non inscriptible. Les fixtures vérifient les invariants ; un parcours
réel séparé démontre la disponibilité effective du fournisseur.

Risques élevés ouverts : expansion récursive, mélange de droits, fausse mémoire
centrale, fausse qualité de modèle, duplication d'effet ou dépense, deadlock.
Pas de déploiement externe ni de nouveau fournisseur requis pour implémenter
les contrats. Aucun P2P de machines dans cette tranche.

## État et preuve actuelle

Lecture des modules cités et du master : réalisée. Spécification enregistrée.
Implémentation, tests, rendu et parcours réel : PENDING.
Les validations de MULTI-AGENT-DAILY-USE restent distinctes et ne prouvent pas AR.
Acceptation humaine finale requise, non reçue.

## Recherche de référence

La [recherche vues et logique](AGENT-ASSIST-VIEWS-RESEARCH.md) et son
[annexe backend](AGENT-ASSIST-LOGIC-RESEARCH.md), datées du 3 octobre 2026,
précisent les projections, interactions et choix de routage proposés.
Elles ne valident aucun critère AR et ne changent pas le statut PLANNED.


## Avancement après recherche UX du 03/10/2026

AR-T01 IN_PROGRESS. `src/adapters/agent-assistance.ts` définit la demande versionnée, les transitions durables, la projection passive et la reprise interrompue. Les consultations existantes publient demandeur, helper, question, modèle, motif et sources de journal. Les vues lisent ces liens sans les inférer. Preuves et limites : INTERACTIVE-WORK.md, suite UX01 à UX04. Le contrat complet de budget/profondeur, l'entraide depuis tous les rôles, le routage adaptatif et la redistribution centrale restent à implémenter. AR-T06 IN_PROGRESS pour la navigation et les liens réellement enregistrés ; aucun critère AR global déclaré terminé.
