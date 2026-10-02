# Critères d’acceptation canoniques

Les scénarios détaillés restent dans H01 à H10 ; state.json porte les IDs, le graphe et les statuts.

## AC-B00.1

Requirement : REQ-B00.1

Given : The context and fixtures stated in README.md

When : Lire HANDOFF, README, règles applicables et specs du premier lot.

Then : Instructions, contrat produit et specs du premier lot sont lus et leurs contraintes figurent dans la carte du système.

Verification : inspection, baseline run

État : VERIFIED ; preuves : EV-B00

## AC-B00.2

Requirement : REQ-B00.2

Given : The context and fixtures stated in README.md

When : Relever HEAD, état Git, tests et diagnostics initiaux dans STATUS.md.

Then : HEAD, changements préexistants, résultat de suite et diagnostics de départ sont consignés sans réutiliser les chiffres historiques.

Verification : inspection, baseline run

État : VERIFIED ; preuves : EV-B00

## AC-B00.3

Requirement : REQ-B00.3

Given : The context and fixtures stated in README.md

When : Construire le manifeste minimal du corpus H10.1 et un scénario fil rouge.

Then : Un manifeste versionné distingue fixtures, processus réels et essais provider, avec parcours fil rouge et oracles explicités.

Verification : inspection, baseline run

État : VERIFIED ; preuves : EV-B00

## AC-B00.4

Requirement : REQ-B00.4

Given : The context and fixtures stated in README.md

When : Reproduire les défauts d'identité du plan et de contexte non borné avant correction.

Then : La perte de spec et la duplication de contexte sont reproduites avec un résultat mesuré avant correction.

Verification : inspection, baseline run

État : VERIFIED ; preuves : EV-B00

## AC-H01.1

Requirement : REQ-H01.1

Given : The context and fixtures stated in 01-OBJECTIVES.md

When : Schémas versionnés, IDs stables, projections et dépendances.

Then : Deux intentions identiques ont des IDs distincts ; reformulation conserve ID ; cycle et schéma invalide sont refusés sans append.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H01.2

Requirement : REQ-H01.2

Given : The context and fixtures stated in 01-OBJECTIVES.md

When : Extraction et correction d'objectif en conversation ordinaire.

Then : Une intention et correction naturelles modifient le contrat et ses travaux sans commande interne ni sélection de mode.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H01.3

Requirement : REQ-H01.3

Given : The context and fixtures stated in 01-OBJECTIVES.md

When : Critères avec provenance, révision et autorité explicites.

Then : Un check généré ne devient pas autorité ; une preuve R ne clôt pas R+1 ; un renouvellement explicitement autorisé lie le nouveau critère au nouveau contrat.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H01.4

Requirement : REQ-H01.4

Given : The context and fixtures stated in 01-OBJECTIVES.md

When : Raccordement plans/tâches/mémoire/preuves au contrat courant.

Then : Plans, tâches, mémoire, artefacts et preuves référencent ID/révision ; les références obsolètes sont distinguées des engagements courants.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H01.5

Requirement : REQ-H01.5

Given : The context and fixtures stated in 01-OBJECTIVES.md

When : Compatibilité des goals/plans déjà enregistrés.

Then : Les anciens journaux sont lisibles sans nouvelle provenance inventée ni mutation du fichier initial.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H09.1

Requirement : REQ-H09.1

Given : The context and fixtures stated in 09-RELIABILITY.md

When : Validation des payloads, migration et replay des anciennes sessions.

Then : Payloads versionnés sont validés avant écriture et replay ; migration préserve original, incompatibilités et provenance inconnue.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H02.1

Requirement : REQ-H02.1

Given : The context and fixtures stated in 02-AUTONOMY.md

When : Décision structurée avec base de révision et admission runtime.

Then : Toute décision admise porte objectif, révision, sources, justification et scope ; une proposition obsolète est redérivée avant effet.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H02.2

Requirement : REQ-H02.2

Given : The context and fixtures stated in 02-AUTONOMY.md

When : Specs utiles et tâches identifiables, versionnées, consultables/exportables.

Then : Spec et tâches possèdent identité/version, dépendances et résultat attendu ; l’utilisateur peut les consulter et exporter sans divergence de copies.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H02.3

Requirement : REQ-H02.3

Given : The context and fixtures stated in 02-AUTONOMY.md

When : Processus léger et questions seulement quand nécessaires.

Then : Une tâche triviale évite le cérémonial ; une ambiguïté essentielle suscite une question ciblée pendant que les branches indépendantes avancent.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H02.4

Requirement : REQ-H02.4

Given : The context and fixtures stated in 02-AUTONOMY.md

When : Révision du plan à partir des échecs observés et revue appropriée.

Then : Une observation de rejet change réellement la stratégie ou le plan ; la répétition sans progrès est détectée et revue séparément.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H03.1

Requirement : REQ-H03.1

Given : The context and fixtures stated in 03-MEMORY-CONTEXT.md

When : Extraction mémoire sourcée/idempotente après échanges et observations.

Then : Échanges et observations utiles alimentent automatiquement la mémoire ; double traitement ou crash ne produit pas de doublons.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H03.2

Requirement : REQ-H03.2

Given : The context and fixtures stated in 03-MEMORY-CONTEXT.md

When : Contradictions, réponses et leçons avec historique.

Then : Contradiction, réponse et réfutation conservent versions, sources et texte original ; la correction humaine garde autorité.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H03.3

Requirement : REQ-H03.3

Given : The context and fixtures stated in 03-MEMORY-CONTEXT.md

When : Compilateur borné et lecture ciblée des sources omises.

Then : Un journal long produit un frame borné compatible avec le budget déclaré ; les contraintes anciennes restent présentes et les sources omises sont récupérables.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H03.4

Requirement : REQ-H03.4

Given : The context and fixtures stated in 03-MEMORY-CONTEXT.md

When : Reconstructions et isolation session/projet/personnel.

Then : Changement/reprise reconstruit le contexte courant ; données de session/projet/personnelles ne traversent pas implicitement les périmètres.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H03.5

Requirement : REQ-H03.5

Given : The context and fixtures stated in 03-MEMORY-CONTEXT.md

When : Journal long, petite fenêtre et substitution de modèles mesurés.

Then : Mesures de petite fenêtre et autre modèle démontrent récupération et réussite sur journal long, avec tokens estimés/mesurés distingués.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H04.1

Requirement : REQ-H04.1

Given : The context and fixtures stated in 04-RESEARCH-SKILLS.md

When : Choisir/raccorder le connecteur de recherche et sa configuration explicite.

Then : Une route explicitement configurée donne des résultats de recherche attribués ; sans route aucune recherche payante ou citation inventée ne survient.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H04.2

Requirement : REQ-H04.2

Given : The context and fixtures stated in 04-RESEARCH-SKILLS.md

When : Lecture locale/web, résultat durable, limites et cancellation.

Then : Une lecture locale/web produit une source durable bornée avec hash et abort ; erreurs/redirect privées/format non supporté restent explicites.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H04.3

Requirement : REQ-H04.3

Given : The context and fixtures stated in 04-RESEARCH-SKILLS.md

When : Attribution, fraîcheur/version et citations effectivement obtenues.

Then : Les réponses citent les URL effectivement lues et la version utile ; cache périmé et instructions hostiles ne modifient pas le contrat.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H04.4

Requirement : REQ-H04.4

Given : The context and fixtures stated in 04-RESEARCH-SKILLS.md

When : Découverte des skills configurés et chargement à la demande.

Then : Skills installés sont découverts dans racines configurées avec version ; contenu chargé à la demande ; illisibilité se distingue de l’absence.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H04.5

Requirement : REQ-H04.5

Given : The context and fixtures stated in 04-RESEARCH-SKILLS.md

When : Skill local essayé, révisé, réutilisé et promouvable avec preuves.

Then : Un skill généré est essayé, révisable, réutilisé par un autre worker, puis promouvable/rollbackable sans augmentation de privilèges.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H09.2

Requirement : REQ-H09.2

Given : The context and fixtures stated in 09-RELIABILITY.md

When : Recovery explicite et reconciliation core/vue/artefacts.

Then : Crash entre core/vue/artefacts est reconciliable ; recovery conserve original et rapport ; disque refusé suspend effets mais navigation fonctionne.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H09.3

Requirement : REQ-H09.3

Given : The context and fixtures stated in 09-RELIABILITY.md

When : Contrats d'outils et résultats complets référencés.

Then : Outils déclarent scope/effets/cancellation/limites ; résultats complets ont références ; arrêt de descendants incertains reste explicite.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H05.1

Requirement : REQ-H05.1

Given : The context and fixtures stated in 05-CONTINUITY.md

When : Cycle de vie run/tranche/inférence distinct de l'objectif.

Then : Objectif ouvert survit à fin de run/tranche, quota, outil tué et panne technique, avec cause et prochaine action distinctes.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H05.2

Requirement : REQ-H05.2

Given : The context and fixtures stated in 05-CONTINUITY.md

When : Continuation bornée entre tranches actives.

Then : Une tâche de plus de huit inférences traverse plusieurs tranches automatiquement sous plafond cumulé et dans la même exécution autorisée.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H05.3

Requirement : REQ-H05.3

Given : The context and fixtures stated in 05-CONTINUITY.md

When : Reconstruction à la limite et détection de stagnation.

Then : Approche de fenêtre renouvelle le contexte ; répétitions sans observations nouvelles déclenchent adaptation ou blocage justifié.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H05.4

Requirement : REQ-H05.4

Given : The context and fixtures stated in 05-CONTINUITY.md

When : Inspecter/reconcilier avant de répéter un effet incertain.

Then : Un effet sans réponse est inspecté/reconcilié avant retry ; aucun exactly-once universel ou rollback fictif n’est annoncé.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H05.5

Requirement : REQ-H05.5

Given : The context and fixtures stated in 05-CONTINUITY.md

When : Budgets cumulés, arrêt propagé, reprise au lancement explicitement configurable.

Then : Stop empêche toute continuation et réponse tardive ; coûts inconnus restent inconnus ; chargement sans opt-in ne redémarre aucun effet.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H06.1

Requirement : REQ-H06.1

Given : The context and fixtures stated in 06-AGENTS.md

When : Contrats de délégation et choix automatique des rôles.

Then : Délégation automatique choisit une unité utile avec worker ID, contrat, scope, capacité, budget et résultat attendu.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H06.2

Requirement : REQ-H06.2

Given : The context and fixtures stated in 06-AGENTS.md

When : Contrôleur et deux workers processus réels avec receipts/revisions.

Then : Deux processus réels publient des receipts à un état durable commun ; sortie R refusée après changement pertinent R+1.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H06.3

Requirement : REQ-H06.3

Given : The context and fixtures stated in 06-AGENTS.md

When : Workspaces isolés et intégration explicitement vérifiée.

Then : Écritures isolées sont intégrées explicitement ; conflit reste visible ; preuve finale couvre le résultat composé.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H06.4

Requirement : REQ-H06.4

Given : The context and fixtures stated in 06-AGENTS.md

When : Correction à R+1, rebase et remplacement après disparition.

Then : Un agent tué est remplacé depuis projection commune ; correction se propage immédiatement et effets incertains sont reconciliés.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H06.5

Requirement : REQ-H06.5

Given : The context and fixtures stated in 06-AGENTS.md

When : Responsabilités et budgets partagés exposés aux projections.

Then : Responsabilités, état utile et consommation cumulée se projettent sans dépendre de messages privés.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.1

Requirement : REQ-H07.1

Given : The context and fixtures stated in 07-PROVIDERS.md

When : Anthropic direct, contrats et essai d'intégration configuré.

Then : Transport Anthropic authentifié selon docs officielles passe contrats outils/messages/usage/abort et essai réel configuré.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.2

Requirement : REQ-H07.2

Given : The context and fixtures stated in 07-PROVIDERS.md

When : Capacités connues/inconnues et taille de contexte par modèle.

Then : Capacités supportées/inconnues et fenêtre de contexte sont représentées fidèlement ; modèle à petite fenêtre reçoit un frame compatible.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.3

Requirement : REQ-H07.3

Given : The context and fixtures stated in 07-PROVIDERS.md

When : Changement actif à une frontière sûre avec état cohérent après échec.

Then : Changement en plein travail invalide ancienne inférence, attend/reconcilie l’effet en cours et préserve contrat/mémoire après erreur.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.4

Requirement : REQ-H07.4

Given : The context and fixtures stated in 07-PROVIDERS.md

When : Streaming complet, outils validés, usage et abort.

Then : Streaming partiel ne lance aucun outil incomplet ; texte provisoire, résultat final, usage et abort restent distincts.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.5

Requirement : REQ-H07.5

Given : The context and fixtures stated in 07-PROVIDERS.md

When : Routing autorisé et auth supportée ; diagnostic si indisponible.

Then : Routing utilise uniquement routes/plafonds autorisés ; auth abonnement non supportée reste indisponible sans extraction de token tiers.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H08.1

Requirement : REQ-H08.1

Given : The context and fixtures stated in 08-TERMINAL-UX.md

When : Vue travail progressive, intention et états lisibles.

Then : Écran principal montre intention, objectif, exécution et observation utile avec détails accessibles sans mode obligatoire.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H08.2

Requirement : REQ-H08.2

Given : The context and fixtures stated in 08-TERMINAL-UX.md

When : Consultation/correction objectifs, spec et mémoire avec historique.

Then : Les vraies frappes permettent consulter et corriger contrat/spec/mémoire avec historique et même sémantique que la conversation.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H08.3

Requirement : REQ-H08.3

Given : The context and fixtures stated in 08-TERMINAL-UX.md

When : Vues agents, sources, outils et sorties complètes.

Then : Agents, sources et résultats longs sont inspectables avec références et statut inconnu/produit/vérifié correctement distingués.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H08.4

Requirement : REQ-H08.4

Given : The context and fixtures stated in 08-TERMINAL-UX.md

When : Arrêt/reprise/changement actif compréhensibles au clavier.

Then : Arrêt, reprise et changement actif sont accessibles et comprennent pending/error/uncertain sans perdre brouillon ni focus.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H08.5

Requirement : REQ-H08.5

Given : The context and fixtures stated in 08-TERMINAL-UX.md

When : Tests Ink/PTY, trois tailles, resize, focus, Unicode et sans couleur.

Then : Parcours clavier passe en Ink et PTY aux trois tailles, resize, Unicode et sans couleur ; Entrée overlay ne soumet pas le brouillon.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H09.4

Requirement : REQ-H09.4

Given : The context and fixtures stated in 09-RELIABILITY.md

When : Installation packagée, export/import, rétention et racines portables.

Then : Installation packagée dans HOME temporaire, export/import et rollback/rétention passent sans chemins personnels implicites.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H09.5

Requirement : REQ-H09.5

Given : The context and fixtures stated in 09-RELIABILITY.md

When : Pannes injectées et traces sans credentials ni preuves inventées.

Then : Pannes et tentatives hors scope sont testées ; journaux/exports n’exposent pas credentials et ne fabriquent pas de preuves.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H02.5

Requirement : REQ-H02.5

Given : The context and fixtures stated in 02-AUTONOMY.md

When : Choix du processus évalués avec des providers réels.

Then : Des modèles réels accomplissent les scénarios de choix de processus avec traces attribuées, et les échecs restent dans le rapport.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H10.1

Requirement : REQ-H10.1

Given : The context and fixtures stated in 10-VALIDATION.md

When : Corpus/manifeste complété et oracles gelés hors du producteur.

Then : Corpus versionné complet, budgets préfixés et checks hors producteur couvrent cas logiciels, documentaire, correction, crash et skill.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H10.2

Requirement : REQ-H10.2

Given : The context and fixtures stated in 10-VALIDATION.md

When : Rapports distinguant preuves déterministes, intégrations et modèles réels.

Then : Chaque promesse rapporte niveau de preuve, commit, scénarios, échecs et omissions avec traces récupérables.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H10.3

Requirement : REQ-H10.3

Given : The context and fixtures stated in 10-VALIDATION.md

When : Runs répétés faible/fort modèle et comparaison OpenCode reproductible.

Then : Runs répétés faible/fort modèle et OpenCode comparable ont mêmes conditions/oracles et toutes les mesures connues/inconnues.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H10.4

Requirement : REQ-H10.4

Given : The context and fixtures stated in 10-VALIDATION.md

When : Feature réelle, correction, crash, reprise différée et substitution.

Then : Feature réelle corrigée puis interrompue reprend plus tard avec autre modèle/agent et valide le contrat courant.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H10.5

Requirement : REQ-H10.5

Given : The context and fixtures stated in 10-VALIDATION.md

When : Rapport de remplacement, seuils préfixés et limites explicites.

Then : Rapport de remplacement rattache chaque exigence aux preuves, seuils fixés et écarts ; aucune supériorité non mesurée.

Verification : automated, inspection, runtime

État : PENDING ; preuves : PENDING

## AC-H07.2a

Requirement : REQ-H07.2a

Given : A named capability has been appended to the canonical store

When : compileFrame reconstructs capabilities

Then : Une capacité enregistrée apparaît avec son vrai nom dans le frame ; régression reproduit la lecture actuelle de name absent et vérifie la correction ciblée.

Verification : automated

État : PENDING ; preuves : PENDING


Mise à jour AC-H07.2a : VERIFIED, preuve EV-CAPABILITY (régression échec avant / réussite après ; test/loop.test.ts). État machine canonique dans state.json.


Extension E01 : E01.1 et E01.2 vérifiés par EV-SHARED-SCOPES (evaluation/shared-context-evidence.md). E01.D1 corrigé et régressé. E01.3 et E01.4 restent TODO. Projet IMPLEMENTING ; aucune clôture globale.

## AC-E01.5 (PENDING)

REQ-E01.5 : corpus canonical versionné, CAS, historique humain/modèle et tombstones préservés ; retrieval automatique sourcé au runtime ; index reconstructible sans perte. Vérification stockage/concurrence/runtime/reconstruction.

## AC-E01.6 (PENDING)

REQ-E01.6 : entreprise/équipe/projet/personnel, autorité distincte du document ; contrôle avant recherche puis à lecture, ancienne référence refusée après révocation ; auth réelle reliée à E01.3.

## AC-E01.7 (PENDING)

REQ-E01.7 : corpus pertinent, mesures qualité/latence/coût, tests de reconstruction ; vectorisation seulement si gains démontrés.

2026-10-02 REQ-SG01–SG09 et AC-SG01–SG09 : critères et méthodes dans STATE-GRAPH.md et state.json, tous PENDING. La validation du plan ne valide aucune fonctionnalité runtime.

## Extension Intent / Project Map / budgets adaptatifs — 2026-10-02

Voir [la spécification canonique](INTENT-MAP-ADAPTIVE.md) et [les paquets OpenCode](OPENCODE-ORCHESTRATION.md). C8–C10 ajoutent 15 tâches et critères PENDING dans state.json ; aucune implémentation ni clôture annoncée. Les risques, transitions et vérifications de cette extension sont détaillés dans la spec.

Extension C11 : [Human Legibility](HUMAN-LEGIBILITY.md), quatre tâches supplémentaires TODO/PENDING. Vue humaine dérivée des mêmes événements ; checkpoints par exception, corrections directes et preuves de livraison distinctes de la compréhension.
