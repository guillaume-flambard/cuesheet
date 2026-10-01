# H09 : durabilité, outils et distribution

## Résultat

Le harness tient ses engagements après incident, reste portable et expose
honnêtement les effets dont l'état est inconnu. Une installation neuve peut
utiliser le produit sans dépendre des chemins de cette machine.

## Stockage

Conserver append-only, séquences, write-through et refus après erreur de persistance.
Versionner manifests, payloads et projections. Définir les migrations avec copies
préservées et compatibilité de lecture. Une ancienne donnée incomplète reste
incomplète ; la migration n'invente ni auteur ni validation.

Définir les garanties exactes entre journal core, vue et artefacts. Réconcilier
après crash entre deux écritures : état produit, présenté, ou présentation non
persistée. La vue reste reconstruisible ; elle ne devient pas une preuve. Enregistrer
les intentions avant les effets et conserver références/digests des résultats.

Le recovery d'un journal endommagé est une opération explicite et inspectable :
conserver l'original, rapporter lignes invalides et dernier préfixe valide, produire
un nouveau journal/recovery report. Ne pas silencieusement supprimer des lignes.
Un disque plein, problème de droits ou lock conflict suspend les nouveaux effets.
Conserver navigation, inspection et export des données encore lisibles.

## Outils et artefacts

Définir une interface injectée de capacités avec effets, scope, préconditions,
timeout/opération, cancellation, schéma d'entrée, limites de sortie et référence
de résultat. Les plans et skills n'élargissent pas les permissions.

Le shell actuel contraint cwd/argv et n'est pas un sandbox. Documenter précisément
ce qu'un programme autorisé peut encore faire. Pour les effets hors scope confié,
appliquer une admission explicite. Préserver des environnements d'outils réduits
quand possible ; ne pas journaliser les secrets. Vérifier chemins, symlinks et
redirections en cohérence avec le threat model. Prévoir les contrôles de nettoyage
de processus et de workspaces sans prétendre à l'arrêt garanti de tout petit-fils.

Les outils d'édition doivent fournir avant/après ou patch, attribution, conflit
et résultat observable. Les fichiers de preuve et critères restent séparés des
zones modifiables par le producteur. Un résultat volumineux n'est pas perdu à
cause de la troncature d'affichage ; sa référence peut être lue progressivement.

## Installation et données

Racines injectables avec defaults XDG/HOME, chemins portables, configuration
documentée, diagnostics de démarrage, export/import des sessions et critères avec
leurs digests. Définir une politique de rétention et de suppression explicite des
artefacts, logs et caches. Aucune collecte distante ou télémétrie implicite.
Tester l'installation packagée dans un environnement temporaire indépendant.

## Acceptation et tâches

- [ ] H09.1 Schémas, migrations et replay des anciennes sessions.
- [ ] H09.2 Recovery explicite et reconciliation core/vue/artefacts.
- [ ] H09.3 Contrats d'outils, outputs complets et arrêt documenté.
- [ ] H09.4 Portabilité, installation, export/import et rétention.
- [ ] H09.5 Injection de pannes, absence de secrets et invariants maintenus.

Tests : fichier tronqué, JSON invalide, disque/droits refusés, writer vivant/mort,
crash entre journaux, conflit de séquences, symlink, secret dans erreur provider,
output volumineux, import ancien schéma, export/import d'une preuve, installation
dans HOME temporaire. Documenter les garanties démontrées et celles hors scope.

Réutiliser `session-store.ts`, `terminal-session.ts`, `effect-receipts.ts`,
`artifact-capture.ts`, `shell.ts`, tests de store/portabilité. Une modification core
exige le contre-exemple reproductible et le respect de CONTRIBUTING.md.

## Défaut H09.4a : terminal absent du paquet

Reproduction à 98a5027 : `rtk node dist/src/cuesheet.js surface` échoue avec « the slice is missing at .../dist/apps/terminal/src/main.tsx » (/tmp/cuesheet-package-terminal-before.log). Les tests d’installation existants prouvent --version/sessions/exports mais pas le terminal interactif.

Correction prévue avant code : build-terminal bundle ESM Node (outil esbuild déjà déclaré par apps/terminal, pas dépendance runtime du paquet), artefacts JS/assets/licences sous dist/apps/terminal. Launcher choisit le bundle quand livré, exécuté par le Node courant ; développement garde le runner TSX. Pas de runner, TypeScript, node_modules externe ou chemin du checkout requis pour le paquet installé. Préserver le whitelist d’environnement, les arguments provider/check/session, cwd et TTY. Le build échoue si le terminal/asset requis n’est pas généré. Source primaire bundling/platform : https://esbuild.github.io/api/#bundle .

Un bundle ESM doit gérer les require des dépendances CommonJS via un require Node, et les assets Yoga import.meta.url. Ne pas laisser des imports de packages externes dans le résultat. Vérifier entrées auto-exécutables/import.meta et chemins relatifs sur le bundle réel.

Acceptation de tranche : build puis npm pack/installation dans une racine temporaire indépendante ; aucune TS exécutable ou node_modules du checkout requise ; lancement du vrai terminal en PTY, saisie de demande, réponse fixture de transport local reçue, Ctrl+C et restauration propre ; non-TTY donne diagnostic terminal et non fichier manquant ; metadata/session écrites seulement dans les racines temporaires. Les modèles live et la supériorité ne sont pas prouvés par ce scénario. Export/import/rétention de H09.4 restent ouverts.

Bundle de livraison : React en production ; le devtools optionnel Ink (DEV=true) est désactivé. DEV ne traverse déjà pas le whitelist launcher. Ne pas laisser un package devtools absent comme import runtime caché.

## Défaut découvert H09.3a : scope des outils après sélection de projet

Inspection pendant la preuve packagée : producer activeWorkspace et mémoire changent avec scope.path, mais le ShellToolRunner du runtime conserve roots/defaultCwd du lancement. Un argv relatif demandé pour un projet lié peut donc exécuter dans le répertoire initial. ResearchTools et skills projet gardent aussi le cwd initial. Reproduction réelle à établir avant correction ; aucune affirmation de succès depuis la seule inspection.

Tranche finie prévue : factories contrôleur pour tools/research/skills par scope choisi, activées au début de l’exécution ; mémoire et frame suivent le même scope. Racines de skills explicitement configurées restent explicites, racine projet par défaut suit le projet. Le modèle ne choisit pas la factory ou les roots. Le journal d’intent doit porter le cwd effectivement admis pour l’audit/reconciliation des effets. Ne pas enregistrer une scope modèle mensongère puis exécuter ailleurs.

La branche de choix ambigu de resolveScope expose actuellement les paths de registre relatifs à projectsRoot, alors que start les consomme comme paths d’exécution. Normaliser les options offertes en chemins de projet absolus ; garder même règle de confiance du registre, sans modifier core ni élargir arbitrairement les roots modèle.

Acceptation de tranche : vrai fichier écrit seulement au projet explicitement lié, cat relatif retrouve le contenu de ce projet, input.cwd hors scope est refusé par runner ; défauts source reproduits avant patch ; skills/recherche locale lisent le projet lié ; choix ambigu donne deux chemins absolus puis exécute seulement le projet choisi ; correction/reprise/receipts historiques restent cohérents. Garde typing, PTY/install régression et suite requises. Cette tranche ne crée pas un sandbox OS pour node/git/npm ; R06 reste ouvert.
