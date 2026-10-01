# E01 : contexte de projet et d’entreprise partagé

Intention du propriétaire (2026-10-01) : tous les développeurs et agents disposent d’une structure commune synchronisée, évolutive, de mémoire et de workflows adaptés à l’entreprise. Cette extension s’ajoute aux six chantiers ; elle ne remplace pas les exigences H01–H10.

## Livraison finie et ordre

E01.1 (P0) Journal partagé de mémoire versionnée par scope, sources de session, écritures conditionnelles et conflits explicites. Deux vrais processus doivent partager le résultat sans conversation privée.
E01.2 (P0) Montage explicite de contextes d’entreprise en lecture, mémoire de projet automatique sur le projet courant ; aucun scope personnel ou autre projet implicite. Le snapshot porte ID/révision/digest et se reconstruit à chaque inférence ; une proposition fondée sur un contexte périmé est refusée avant nouvel effet.
E01.3 (P1) Synchronisation entre machines via transport explicitement choisi, authentification, permissions, historique de conflit et fonctionnement hors ligne. Première tranche : dossier partagé/local uniquement ; aucun service cloud ajouté ou déployé implicitement.
E01.4 (P1) Consultation/correction/export des scopes au terminal, workflows versionnés, migration et tests réels à deux développeurs/agents.

## Tranche avant code : E01.1–2

Journal append-only context.jsonl dans .cuesheet/shared pour le projet ; racines d’entreprise explicites dans CUESHEET_CONTEXT_ROOTS. Lecture ne crée rien. Pas de deuxième copie autoritative dans le journal de session : le contexte y est une projection et les références restent récupérables par read_shared_context. Un record est une interprétation modèle sourcée, pas une autorisation ou preuve. Les seules écritures du modèle vont au scope projet de son cwd. Aucun accès en écriture aux racines d’entreprise montées.

Record v1 : ID d’extraction déterministe, type/texte/sources {session,seq}, auteur modèle, scope, révision journal. Répétition exacte ne duplique pas. Le store conditionnel refuse une base périmée et ne réessaie pas sans relecture ; schémas corrompus refusent la lecture sans réécriture. Le chemin est celui raccordé par le runtime, jamais un input modèle. Conserver les limites de texte et de journal ; bornage du frame existant s’applique aussi aux scopes partagés.

Dans remember, scope absent/session garde le comportement existant ; scope project publie une interprétation vers le journal projet depuis les sources existantes de cette session. Après publication, prochaine inférence obligatoire avant autres effets du même lot. Le producteur compare le digest partagé lu à chaque frontière d’action et après l’inférence ; finish contrôle aussi sa fraîcheur après la vérification. Un outil déjà démarré peut finir ; aucun exactly-once distribué revendiqué.

## Acceptation

AC-E01.1 : deux processus distincts produisent un conflit ou un append sérialisé sans écrasement ; un lecteur frais retrouve les sources/ID ; retry exact garde la même révision.
AC-E01.2 : deux projets isolés ; racine d’entreprise seulement si explicitement montée ; update externe pendant infer ou avant outil rejette la proposition et atteint le frame suivant.
AC-E01.3 : transport réseau/offline/auth et conflit testés sur deux machines (PENDING).
AC-E01.4 : scopes consultables/corrigibles/exportables avec clavier réel ; workflows communs récupérables (PENDING).

Risques : shared filesystem sans garanties POSIX n’est pas un backend distribué prouvé ; chemins/symlinks configurés font partie de la confiance locale ; racines extérieures jamais découvertes automatiquement ; corpus commun peut dépasser le frame et doit être récupérable, sans effacer une instruction humaine ; panne d’un scope explicitement monté reste une erreur, pas mémoire vide.

Défaut découvert E01.D1 (P1) : SessionStore.appendIfCurrent numérote le premier append conditionnel à 0 pour base -1, alors que append/nextSeq démarrent à 1. Correction requise avec régression avant journal partagé. Aucun changement core.

Revue d’isolation : le binder peut sélectionner un projet différent du cwd initial. Le scope mémoire doit suivre scope.path à chaque nouvelle exécution, en conservant seulement les montages entreprise explicitement configurés. Aucun souvenir du projet initial ne doit traverser ce changement par défaut.

## Tranche E01.4a : consulter les scopes au terminal

Avant code : palette Contexte partagé, lecture pure du projet d’exécution et des seuls montages entreprise configurés. Présenter scope/type/ID/révision/digest, nombre de records, contenu/rationale et sources session/seq, origine modèle explicitement interprétative. Pages de 20 records, suivant/précédent au clavier, scroll/resize et Escape. Relire le snapshot à chaque ouverture/page ; un digest qui change remet la pagination à zéro. Aucun appel modèle, journal ou répertoire créé par consultation. Scope indisponible/corrompu donne une erreur explicite, aucun faux contexte vide. Sans configuration, état indisponible clair. Pas d’édition/export/permission réseau promis par cette tranche.

Vérification : stores réels projet/organisation, autre projet exclu, pagination complète et source présente, lecture à vide sans mkdir, snapshot changé et corruption ; App Ink réel clavier Escape/next/resize40×14,80×24,120×36 sans débordement. Parent E01.4 reste ouvert.

Affichage : retirer les caractères de contrôle des sources avant rendu terminal ; après resize conserver un offset visible. La provenance et le contenu stockés restent intacts.
