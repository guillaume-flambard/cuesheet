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
