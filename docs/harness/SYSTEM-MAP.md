# Carte du système et périmètre canonique

Ce dossier réutilise README (intention), H01 à H10 (specs), TODO (ordre), STATUS
(preuves historiques) et evaluation/manifest.json (corpus initial). Les contrats
machine et critères détaillés sont dans state.json et ACCEPTANCE.md. Le protocole
whole-project-protocol a été introduit pendant l'exécution ; ses compléments
canoniques sont ajoutés avant toute nouvelle implémentation.

## Chaîne terminal actuelle

`bin/cuesheet` / `src/cuesheet.ts` → `surface-cli.ts` (env autorisé) → App Ink →
Store vue → Producer.say → événements de demande/directive → objectifs applicatifs
→ `runAgentLoop` → frame borné → adapter modèle → proposition → garde de révision
→ intention durable d'outil → outil/runtime → observation → journal et projection
→ UI. Reprise → journal validé → objectif/directives/preuves → nouvelle exécution
explicite. Le chargement d'une vue ne lance pas l'exécution.

Validation : finish → capture du workspace → check déclaré épinglé → résultat et
work_verified liés à ID/révision d'objectif → preuve uniquement si contrat courant.
Correction après binding → résultat historique possible mais fermeture refusée.
La capacité de renouveler un binding autorisé reste à construire.

Organisation : organize_work / remember / create_skill / describe_objective → notes
applicatives → projections. Read_history récupère des sources sans mutation. Les
skills actuels sont des instructions de session, pas des plugins installés.

Recherche en cours : read_document / search_web → ResearchTools → publicUrl → DNS
public vérifié et connexion TLS à l'adresse épinglée → contenu borné → note source
→ résultat attribué → snapshot de sources. Brave est une route optionnelle explicite.
L'auth ne figure pas dans la note et ne suit pas les redirections. Les simulations
de transport ne prouvent pas la connexion TLS publique réelle.

## Données et ownership

Core EventStore : pur, mémoire. SessionStore : séquences/append/fsync et transactions.
TerminalSession : manifest, journal core, journal vue et claim exclusive. La vue
est dérivée ; les records d'objectifs versionnés sont validés avant append et reload.
Les workers existants produisent des receipts ; le runtime multi-agent terminal
est encore absent. Artifacts et critères épinglés restent hors workspace mutable.

Les IDs/révisions portent la continuité du contrat ; le texte seul n'est plus une
clé pour les nouveaux objectifs. Les goals historiques sont lus conservativement.
Une interprétation du modèle ne devient pas une instruction humaine ou une preuve.

## Build et environnements

Node >=22 ; tests source TypeScript strip-only ; package racine sans dépendance
runtime ajoutée. Terminal : React/Ink/tsx/esbuild/TypeScript dans son workspace.
Build racine : scripts/build.sh, connu pour émettre malgré diagnostics hérités.
Pas de répertoire CI `.github` trouvé pendant cette découverte ; packaging/build
réels restent à vérifier dans H09.4. Le contrôle statique courant est différentiel,
pas une déclaration de typecheck global propre.

## Frontières

ShellToolRunner est une contrainte de commande/cwd, pas un sandbox OS. Credentials
HTTP configurés hors préférences persistées. Les contenus web et skills sont des
sources sans autorité sur les permissions ou critères. Aucune action serveur,
publication, push, message externe ou télémétrie n'est autorisée par ce dossier.

## Vérification et observabilité

Tests : core/store, receipts, artifact verifier, providers, objectives, shared
context, history retrieval, terminal persistence, clavier Ink/PTY. Logs bornés et
références aux résultats dans les événements. Le corpus distingue script, processus
réel, réseau réel et qualité d'un modèle réel. Voir VERIFICATION.md et RISKS.md.

Complétude visée : si toutes les tâches P0/P1 de state.json et leurs AC passent,
le parcours de README et la comparaison H10 sont réalisables. L'audit final cherche
encore les exigences absentes du graphe ; il n'est pas exécuté à cette étape.

Exécution : producer → execution-slices.ts → core.runAgentLoop par tranche → contexte journal reconstruit. Notes terminal.execution reflètent les limites et cause de continuation. ResearchTools au runtime reçoit cwd pour documents locaux et route Brave explicite ; SkillTools reçoit racines explicites ou .cuesheet/skills.

execution-state.ts projette terminal.execution v1, validé par TerminalSession avant append/reload et dans le listing des sessions. session-view dérive interrupted seulement au chargement ; shared-context expose les états sous le plafond existant.

Tool-receipts.ts (distinct du ReceiptStore historique de spawn) suit terminal.intent → terminal.receipt. Producer bloque mutations/finish sur intention incertaine, admet cat/ls puis reconcile_effect ; shared-context conserve ces incertitudes comme essentiels, view les affiche. TerminalSession valide les payloads/replay/listing. Aucune conclusion de modèle ne devient preuve indépendante.

Modèle : UI Models → ModelBinding.select → prepareModelPreferences + Producer.modelSelected → journal/core modèle → activation binding → abort infer précédente → guard rejette réponse périmée → prochaine inférence avec contexte recompilé. Reçu d’un outil déjà commencé reste enregistré. App montre sélection pour la suite et distingue sauvegarde globale refusée.

Plans : work-organizer → work-plans.ts (schéma v1, IDs plan/tâches, dépendances acycliques, révisions) → terminal.work → contexte partagé. TerminalSession valide avant append/reload/listing. Correction d’objectif conserve le plan visible avec current=false ; réadmission exige spec et tâches explicites. Les textes historiques restent lisibles sans inventer leurs IDs.

Mémoire : remember → identity par type/texte exact/sources triées → réutilisation du create initial sans append, même après correction/résolution humaine. Nouveaux records v1 portent objectif/révision et sources ; projectMemory valide provenance, clé et expected pour updates modèle ; TerminalSession valide avant append/reload/listing. Les versions historiques sans schéma restent lues sans réécriture.

Anthropic explicite : résolution clé/modèle/plafond → Messages API HTTPS (system et outils natifs) → validation de réponse complète → ModelResponse → gardes producer habituelles. Catalogue Models paginé/cancellable ; aucune liste de modèles hardcodée. Usage exposé sur adapter, comptabilité cumulée non raccordée. Aucun appel live payé dans cette tranche.

Contexte partagé : runtime raccorde .cuesheet/shared (projet courant) et CUESHEET_CONTEXT_ROOTS (entreprise explicitement montée, lecture seule). SharedMemoryStore → SessionStore conditionnel → context.jsonl versionné avec source {session,seq}. Producer charge digest/révisions avant infer, les compare avant nouvelles actions et après check ; shared-context borne la projection et read_shared_context récupère les records paginés. remember scope:project publie le fait interprété, jamais une autorité ni une preuve. Pas de synchronisation réseau livrée.
