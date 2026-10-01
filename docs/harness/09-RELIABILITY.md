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

Précision de provenance scope : scopeCwd d’un intent est le périmètre contrôleur déclaré, distinct d’un éventuel input.cwd proposé par le modèle. Un input hors scope reçoit un refus, jamais un effet exécuté. Les intents anciens projettent scopeCwd:null ; aucun scope historique inventé. Les guards de reconciliation existants restent conservateurs ; sandbox OS et consolidation inter-scopes restent ouverts.

## Défaut H09.5a : credentials hérités par les outils

Le runner shell transmet process.env complet à execFile. Tranche définie avant code : exclure par nom les credentials natifs utilisés par le harness (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, CUESHEET_API_KEY, BRAVE_SEARCH_API_KEY), comparaison insensible à la casse, dans chaque environnement enfant. Ne pas transmettre d’override depuis input modèle. Préserver PATH/HOME et les variables de build/proxy ordinaires pour compatibilité ; NO_COLOR reste imposé. Le transport provider et recherche conserve ses propres credentials.

Acceptation : reproduire avec uniquement des valeurs fictives dans un environnement injecté ; vrai processus Node enfant ne voit aucune des cinq clés ni variantes de casse, voit la configuration de développement, et ne reçoit pas les overrides proposés dans input. Snapshot indépendant de l’objet fourni et du process.env ; aucun secret fictif dans ToolResult. Refus de scope, abort et types restent vérifiés. Cette tranche ne filtre pas les fichiers accessibles, les arguments, les secrets applicatifs arbitraires ou tous les logs ; R06/R09 et parent H09.5 restent ouverts.

## Défaut H09.1a : auteur inventé au replay

Le create d’objectif v1 attribue actuellement human à tout author sauf unknown, y compris absent ou model. Tranche définie avant code : conserver human/model/unknown explicites ; author absent dans une ancienne donnée devient unknown sans écriture de migration ; auteur présent hors de ces trois valeurs refuse le replay avant mutation. Conserver le texte, l’identité, les sources et le binding existants. Une attribution human explicite ne prouve pas à elle seule une autorisation ; le contrôle de la source humaine reste distinct.

Acceptation : fixtures absente, model, human, unknown ; auteur incorrect/string/objet/null refusé ; relecture pure et journal corrompu inchangé ; tests contrats/binding/reprise/types et suite générale. R10 reste ouvert pour l’ensemble des migrations.

## Découverte isolation (avant prochaine implémentation)

Probe local temporaire : sandbox-exec avec deny file-write et allow root hors .cuesheet bloque deux writes extérieurs/contrôleur, autorise l’écriture projet. Ce résultat ponctuel n’est pas une garantie d’isolation hostile : lectures globales/réseau/RPC/hardlinks non couverts. Apple DTS précise que SBPL n’est pas documenté/supporté pour produits tiers et recommande de ne pas en faire une base produit : https://developer.apple.com/forums/thread/661939 . Pas de backend Seatbelt ajouté au runtime.

Route conteneur documentée par https://docs.docker.com/engine/containers/run/ et https://docs.docker.com/engine/security/ ; image au digest, périphériques/montages/env/réseau/ressources/lifetime explicitement contrôlés, jamais socket Docker dans le conteneur. Docker local installé, socket local absent et moteur indisponible lors de discovery. Démarrage local demandé via CLI desktop pour verification, aucun VPS/déploiement/contact externe ou image téléchargée à ce stade. R06 reste OPEN.

## Tranche H09.3b : backend outils Docker local

Avant code : adapter ContainerToolRunner, même admission allow/name/cwd/path/argv que ShellToolRunner (prepare pur partagé, run local préservé). Route contrôleur uniquement, image immuable sha256/RepoDigest et socket Unix local explicite, jamais DOCKER_HOST distant implicite. Aucun I/O daemon ou mkdir au constructeur/import/inspection.

Chaque appel admis a un nom UUID propre puis create/start/wait/logs/delete via API Engine1.51, Linux/compatibilité vérifiés. Rootfs readonly, UID/GID non-root, cap-drop ALL, no-new-privileges, network none, pas de socket/devices/hostPID/privileged. Seules racines déclarées bindées aux mêmes paths canoniques, propagation privée/non récursive ; contrôle .cuesheet et chemins journal/check internes au root masqués par fichiers/dossiers vides readonly. HOME/temp internes, env minimal explicite sans credentials du harness. Timeout du process par init timeout dans l’image, CPU2/mémoire1GiB/pids128/tmp128MiB/logs1MiB bornés automatiquement. Image officielle de test : node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 ; la route ne pull pas une image/config modèle implicitement.

Saisie argv ne contrôle pas image/API/socket/mounts/resources/network/entrypoint. On n’exécute jamais localement après une erreur conteneur. Statut/output viennent du daemon/logs mux validés et bornés ; erreurs non confirmées restent exit:null. Suppression force du seul nom propre à cet appel, y compris après abort/timeout/create sans réponse confirmée. Cleanup borné sans signal déjà annulé ; échec de cleanup conserve l’état incertain et l’identité à inspecter. Jamais tuer des conteneurs voisins ou arrêter Docker global.

Wiring explicite initial via CUESHEET_TOOL_IMAGE/CUESHEET_TOOL_SOCKET, whitelist launcher et policy visible/snapshot modèle de plateforme Linux/réseau absent. H09.3c séparé assure le choix automatique et l’admission entreprise ; cette tranche seule n’atteint pas la directive de defaults intelligents.

Limites : pas une VM sans aucune faille ; parent R06 reste ouvert pour routes legacy, workers non raccordés, machines/plateformes/caps non vérifiées. Bind projet writable ne borne pas le disque de ce projet ; pas de quotas de filesystem, worktree git externe ou build macOS natif promis. Image Linux doit fournir timeout et outils déclarés ; aucun composant absent ne donne un faux succès. Daemon local/trusted seulement.

Vérification : Node argv peut écrire hors root avant patch ; backend réel ne lit/écrit ni host voisin ni contrôle, écrit/lit repo, env synthétique absent, réseau sortant absent, descendant arrêté avec container, aucun container propre restant. API fake vérifie bodies/mux/faults/aborts/missing image/bad config/no fallback. Runtime/pkg/typechecks/full requis. Docker daemon absent ne devient pas une preuve : tests réels conditionnels notés, passés ici avant clôture.

### Compléments de modèle H09.3b avant code

Les bind mounts ne constituent pas une frontière pour les hardlinks dont un autre alias est hors racine, ni pour les sockets/FIFO/devices accessibles. Avant create : parcours lstat sans suivre les symlinks, borné à 100000 entrées, refus des fichiers réguliers nlink>1 et des fichiers spéciaux ; sous-arbres masqués exclus. Une modification concurrente du filesystem par un autre acteur reste un risque, sans garantie atomique entre scan et montage. Les dépôts à hardlinks nécessitent un workspace isolé ultérieur H06.3 ; jamais fallback local silencieux.

Avant create, la route terminal persiste un reçu de ressource sous le claim de session, journal séparé `<session>.containers.jsonl` sans modifier la révision métier : nom UUID, digest image, scope, référence séquence intent et digest invocation. Après tentative cleanup, reçu removed ou uncertain ; corruption ou écriture d'admission refusée empêche create. La relecture ne nettoie ni ne crée rien ; noms incertains restent inspectables après crash. Le runner standalone expose les callbacks de reçus ; seul le contrôleur fournit les références intent. Vérifier interruption, corruption, admission non persistée et nettoyage non confirmé.

Revue adversariale du lifecycle : après un create sans réponse/identité confirmée, DELETE404 ne prouve pas que le daemon ne terminera pas plus tard la création. Le reçu conserve uncertain (même si suppression tentée) et le masque temporaire reste disponible ; aucune auto-répétition du nouvel effet. removed n'est attesté que pour une création confirmée puis suppression204/404. La reconciliation explicite des ressources après crash reste H05.4, sans inventer une absence.

## Tranche H09.3c : choix automatique local avant code

Sélecteur contrôleur pur/injectable, mode auto par défaut ; overrides CUESHEET_TOOL_MODE=auto|container|local, IMAGE/SOCKET gardés avancés. Socket local owner explicite puis sockets locaux conventionnels HOME/.docker/run/docker.sock, /var/run/docker.sock ; aucun DOCKER_HOST distant, login/pull/start daemon implicite. Socket absent : route locale personnelle déclarée non confinée, montages entreprise refusent les outils externes (inspection/contexte restent possibles). Socket présent ou IMAGE/SOCKET explicite : route conteneur au digest (image Node testée par défaut) ; erreur daemon/image ne bascule jamais local. Override local explicite refusé en présence de montages entreprise, la lecture d'entreprise n'accordant aucun accès arbitraire au host.

Le sélecteur ne prétend pas qu'un socket prouve un daemon sain/image installée : plateforme/API/image/binaries encore vérifiés lors de l'appel, erreurs donnent état incertain. Default Node image expose seulement node/npm/npx/cat/ls (réseau absent, package fetch impossible) ; git/rg/cargo pas annoncés. Image owner immuable personnalisée garde allow déclarée avec limites annoncées, sans preuve de bins installés. Names visibles suivent le runner choisi ; indisponible n'annonce pas de commandes externes. Docker installation/provisionnement et build natif autres images restent H07/H09.4, aucun prétendu remplacement complet.

Vérification : matrice auto/override, absent/stale/invalid local socket, entreprise jamais Shell, contrôle modèle ignore mode/image/socket, runtime effect real auto sans IMAGE/SOCKET, scopes/read-only/renderer/régression ; readonly inspection ne démarre pas daemon ni téléchargement. Cette décision choisit le meilleur backend implémenté disponible ; route personnelle legacy maintenue/annoncée donc R06 toujours ouvert.

### Défaut découvert H09.3d : route figée au lancement

Avant code : runtime capture chooseToolRoute une fois. Si Docker devient disponible entre deux goals/reprises, ancienne route persiste. Factory doit relire uniquement disponibilité des sockets à chaque start/reprise choisi, avec configuration owner IMAGE/SOCKET/MODE et périmètre entreprise capturés au lancement ; pas d'env modèle mutable, pas de changement d'un effet déjà actif. Générer noms/policy du nouveau runner, préserver reçu sous claim et refus sur journal resource endommagé. Perte de daemon pendant appel ne provoque toujours aucun fallback. Tester matrice absence/apparition/disparition et ancien frame remplacé avec H07.2b ; aucune auto-installation.

### Défaut potentiel H09.3e : alias des chemins contrôleur

Discovery avant patch : roots/cwd sont realpath, protectedPaths utilisent resolve lexical pour under(). macOS /var→/private/var, ou root symlink propriétaire, peut ainsi sortir le chemin protégé du test d'appartenance sans le sortir du vrai montage. Reproduire via fichier contrôleur propre temporaire et vrai Docker, jamais un journal utilisateur.

Correction prévue si reproduction : vérifier/refuser symlink final du chemin protégé existant, puis canonicaliser par realpath avant appartenance/mask ; parent alias contrôlé converge vers le même root réel. Aucun montage de données host pour le masque. Garder les refus hardlink/special/controlsymlink et bornes. Vérifier fichier protégé vide readonly, host intact et contenu original non lu, journal placé dans root alias masqué ; source/types/full. Parent R06 reste ouvert.
