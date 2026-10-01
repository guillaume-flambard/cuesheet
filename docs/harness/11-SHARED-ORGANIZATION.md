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

## Tranche E01.4b : correction humaine du projet partagé

Avant code : commandes humaines /context edit|resolve ID REVISION TEXTE depuis le terminal, seulement scope projet actif du contrôleur. Record terminal.user explicite précède tout append partagé ; source {session,seq}. Pas de nouvelle demande/objectif ni outil modèle donnant accès à la correction. Montages entreprise restent en lecture. ID initial et sources d’extraction conservés ; historique append-only de corrections avec texte, opération et source humaine.

Journal partagé v1 crée les records existants ; ajout edit/resolve strictement validé (auteur human, scope identique, cible existante, expectedItem=révision exacte, expectedScope=révision précédente du journal, texte/source valides). Sources initiales ne deviennent pas humaines : current author distingue la correction, historique conserve son attribution. Révision périmée et CAS concurrent refusent sans append partagé. Répétition exacte d’une source/commande réutilise sa correction ; même source utilisée autrement refuse. Retry de l’ancienne extraction retrouve la même ID actuelle, sans annuler une correction ou réactiver un résolu. Journal borné/parsing strict et original préservé sur corruption.

Les résolus restent consultables mais n’orientent pas la prochaine inférence. Les entrées actives corrigées par humain ne sont pas silencieusement supprimées par compaction : erreur de budget si le contexte autoritatif ne tient pas. Elles ne donnent pas de permissions ou de preuve de validation. Digest change à chaque correction/résolution, même effet déjà lancé peut finir, nouvelle proposition périmée refusée. Consultation présente auteur courant/statut et sources/historique.

Acceptation : éditeur/résolution absents reproduits sur00e0524 ; vrai journal/reload, ancien retry sans résurrection, conflit CAS/révision/refus de source dupliquée/corruption sans rewrite ; commande humaine en inférence suspendue écarte la proposition ancienne et garde le même objectif. Aucun write entreprise. Frame conserve humain actif même sous pression puis refuse budget impossible. Les commandes échouées restent des intentions humaines, jamais des succès inventés. Export/workflows/réseau restent ouverts.

Projection d’inférence : conserver le texte courant, type, auteur, statut, révision, sources initiales et références de corrections. Les anciens textes/corrections et la rationale modèle d’un souvenir humain restent récupérables par read_shared_context ; ils ne sont pas dupliqués dans la portion humaine protégée du frame. Cette projection ne modifie jamais la source canonique.

Identité d’une correction réessayée : source/id/opération/texte et révision de cible originale doivent correspondre. Réutiliser la source avec une autre révision est contradictoire et refuse ; la base globale peut être périmée pour retrouver un résultat existant.

## Recommandation architecture entreprise : Vault canonique, retrieval dérivé

Directive propriétaire2026-10-01 : Vault partagé canonique et retrieval complémentaire. Architecture retenue explicitement dans le chat : Vault versionné comme corpus canonique de documents/specs/décisions/workflows ; recherche/RAG comme projection reconstructible qui rapporte sources, versions et portée. Commencer par recherche textuelle et mémoires structurées ; vectorisation conditionnée à des gains mesurés sur corpus pertinent.

Périmètres entreprise/équipe/projet/personnel et droits contrôlés avant sélection et lors de la lecture ; index pas une autorité, documents retrouvés jamais une permission. Registre d’outils séparé pour capacités/versions/droits/règles d’exécution. Client Obsidian possible, pas backend d’auth/synchronisation. Les décisions humaines, hypothèses modèle et records résolus restent distingués. Cette recommandation ne prétend pas livrer E01.3 auth multi-machine, workflows ou RAG évalué.

## Décomposition Vault retenue avant code

E01.5a (P0) Corpus Vault local versionné append-only, documents sourcés, révision/CAS, historique des corrections et tombstones ; aucun index autoritatif. Recherche textuelle reconstruite en mémoire depuis les dernières versions actives.
E01.5b (P0) Raccordement automatique au contexte du goal, sources version/digest récupérables, invalidation des propositions périmées et restitution au terminal ; corpus existant importé explicitement sans écraser les originaux.
E01.6 (P0) Autorité d’accès séparée : entreprise/équipe/projet/personnel, grants contrôleur ; contrôle avant recherche et à chaque lecture, révocation sans fuite par index, tests entre deux identités. Auth multi-machine liée à E01.3 reste obligatoire.
E01.7 (P1) Évaluations retrieval pertinence/coût/latence sur corpus d’entreprise et reconstruction de l’index après panne ; embeddings seulement si gain mesuré, déploiement/rétention explicitement définis.

Tranche E01.5a finie : stockage JSONL version1 dans racine injectée, document ID stable fourni par contrôleur, séquence journal, texte/titre bornés, source structurée auteur humain ou modèle + référence explicite, mise à jour conditionnelle globale et revision document exacte ; historique lisible sans mutation. La recherche textuelle déterministe tokenize Unicode, classe les derniers documents actifs avec passages et références digest/révision, topK borné. Ce composant ne prétend pas encore avoir auth réseau/Obsidian sync/import UI ou sélection automatique de runtime. Lecture pure, corruptions refusées/original intact, stale CAS/résurrection involontaire refusée. Le modèle ne fournit pas la racine et les documents n’accordent jamais les grants d’outil.

Acceptations supplémentaires : AC-E01.5 journal rechargé avec versions/sources inchangées, concurrence CAS, index supprimé/reconstruit résultats identiques, tombstones et corruption ; AC-E01.6 résultat absent avant recherche et lecture refusée après révocation, y compris via référence ancienne ; AC-E01.7 corpus évalué avec métriques et comparaison textuel/vectoriel si introduit. Toutes PENDING au lancement.

### Tranche E01.6a : admission locale de retrieval

Avant code : VaultRetrieval reçoit principal, scopes kind/id/root et callback authorize depuis le contrôleur, jamais depuis le document ou le modèle. Types entreprise/équipe/projet/personnel explicites ; grants pas hérités automatiquement. Avant toute lecture pour rechercher, autoriser search ; après projection vérifier encore search avant restitution. Lecture d'une référence scope/id/revision/digest exige read avant accès au journal et après projection, même pour un ancien résultat autorisé. Scope non déclaré et version/digest inconnus refusent. Journal inaccessible/corrompu d'un scope non autorisé n'est pas ouvert. Aucun import de permission depuis le contenu et aucune permission outil exposée par ce composant.

Acceptation de tranche : scopes autorisés retrouvés/sourcés, scope refusé contenant journal cassé jamais ouvert ; callback révoqué entre sélection et lecture refuse, ancien résultat refusé après révocation ; même principal ne peut inventer root ou scope dans référence. Authentification, distribution de grants et synchronisation appartiennent à E01.3/E01.6 parent encore PENDING.

### Tranche E01.5b1 : retrieval automatique local au goal

Avant code : factory VaultRetrieval par projet contrôleur, principal propriétaire local, scope projet .cuesheet/vault automatique et entreprise vault sous les seuls montages existants explicites. Aucune découverte de Vault personnel/équipe, aucun grant réseau inventé. Scopes explicites locaux accordent search/read, jamais outils/write. Snapshot reconstruit à chaque inference depuis goal courant (top5), digest de tous documents/révisions des scopes admis ; metadata d'index ne persiste pas comme source. Frame borné existant reçoit passages/sources/digests comme contenu non fiable, pas instructions. read_vault_reference donne une version exacte admise avec source et limites de lecture ; recherche manuelle search_vault optionnelle, sans nouveau paramètre utilisateur obligatoire.

Après infer et avant chaque nouvel effet/finish, relecture du snapshot et permissions ; digest différent rejette la proposition et force inférence suivante. Ancienne référence refuse si grant révoqué ou digest/version inexistant. Un effet déjà démarré peut finir. Le scope suit le projet choisi/repris, jamais le cwd initial après binding. Pas de mutation au montage, frame ou consultation. Tests réel corpus/projet, suspension infer/update/revocation, sources, budget et aucun effet périmé ; source/typechecks/full. Cette tranche ne livre pas droits réseau/import/Obsidian/sync/évaluations.
