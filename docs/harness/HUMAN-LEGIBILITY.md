# Human Legibility — compréhension visible depuis l’état commun

Statut : spécification, pas implémentation. Source : quatrième texte fourni le 2026-10-02. Invariant : ne pas laisser diverger silencieusement intention, contexte agent, réalité et informations pertinentes présentées à l’humain. L’agent maintient la vue utile du travail, plutôt que narrer ses opérations.

Réutiliser événements/projections, notifications et interfaces terminal. Human Model est un journal de références vers faits/décisions/hypothèses/questions effectivement présentés, par destinataire/scope, avec révision et timestamp. Il ne représente pas les pensées de l’humain. Présenté, livré et acquitté sont distincts ; un ack technique ne prouve pas compréhension. Données de destinataire protégées ; aucune fuite entre équipes par agrégation.

Transitions : nouvel événement matériel → calcul delta sur projection courante → attribution/sources → présentation/livraison → receipt → invalidation si révision/source change. Crash entre émission et receipt est reconciliable ; idempotency/dedup ne supprime pas un blocage pertinent. Les sorties invalidées restent historiques, explicitement obsolètes.

Politique : niveau 0 opérations routinières silencieuses ; 1 décision utile affichée sans blocage ; 2 hypothèse réversible dans scope autorisé affichée, continuation interruptible ; 3 décision indispensable/irréversible/risquée ou hors autorisation. Le niveau ne crée pas de droit et ne se réduit pas à un score LLM. Une hypothèse touchant un invariant dur ne s’auto-approuve pas. Corriger directement révision/contexte/plan, pas mettre en queue. Une réponse obligatoire ne s’infère jamais du silence.

Explain at boundary : données persistées, contrat inter-app, domaine partagé, permissions, budget ou preuves changés. Deltas : ce qui change, implication pour l’humain, décision prise, sources, action attendue éventuelle. Ne pas réciter historique ou raisonnements privés. Ne pas demander Y/n pour une expansion déjà autorisée ; continuer les branches indépendantes pendant un blocage réel.

UX : vue progressive depuis les mêmes projections, sources consultables au clavier ; status équipe filtré par grants, depuis cursor/révision explicites. Notifications sobres, dédupliquées, réglables ; pas de surveillance ni d’envoi externe implicite. Sans nouvelle information pertinente, conserver un état visible stable ; une panne, un besoin de décision ou une preuve périmée est toujours signalé selon politique.

Vérification : même événement machine/vue, arrêt/correction pendant livraison, destinataire révoqué, duplicate/crash, curseur offline, état stale, perte de receipt et focus/resize. Mesurer fréquence/volume/latence et absence de questions routinières sur parcours fixe ; critères fonctionnels ne sont pas remplacés par une appréciation subjective. Acceptation humaine : sait retrouver pourquoi, impact, inconnues, progression et preuves sans lire toutes les conversations.

Risques : deuxième vérité éditable, inférence de compréhension, fuites par résumé d’équipe, spam et suppression excessive. Mitigations : projection référencée, receipts distincts, permissions avant sélection, fixtures bruit/blocages/révisions. Risques non résolus tant que preuves absentes.

## HL01 — Projection Human Model depuis événements

REQ-HL01 / AC-HL01 : Communicated facts/decisions, assumptions surfaced, unresolved questions et dernière synchronisation sont des références révisionnées aux événements canoniques, scoped par destinataire ; présenté/livré/acknowledged sont distincts, aucune compréhension supposée ni seconde vérité.

Dépendances : IR05. TODO ; preuve PENDING.

## HL02 — Checkpoints et hypothèses non bloquantes

REQ-HL02 / AC-HL02 : Politique owner classe invisible/surfaced/interruptible/blocking selon effets, réversibilité, autorité et ambiguïté ; assume-act-surface dans le scope autorisé, aucune élévation implicite de droits, question bloquante seulement nécessaire et branches indépendantes poursuivies.

Dépendances : HL01. TODO ; preuve PENDING.

## HL03 — Human Deltas et frontières conceptuelles

REQ-HL03 / AC-HL03 : Écart entre état courant et informations effectivement présentées produit deltas sourcés sur changement de contrat/données/scope/risque/preuves ; dedup borné, priorité et réglages sans spam, absence de delta ne cache pas une erreur ou un blocage.

Dépendances : HL02, IR04, AE01. TODO ; preuve PENDING.

## HL04 — Status équipe et correction directe

REQ-HL04 / AC-HL04 : Vue clavier et cuesheet status affichent goal/changes/current/important/open/proof depuis mêmes projections avec permissions ; reprise/resize/offline/delivery failure ne fabrique pas acknowledgement ; correction humaine R+1 invalide immédiatement sorties et deltas obsolètes sans queue.

Dépendances : HL03. TODO ; preuve PENDING.

