# Gestion Git et worktrees par agents — H06.3

Statut : SPECIFICATION ; runtime non livré. Complément de 06-AGENTS.md, aucun déplacement de roadmap. Intention propriétaire : isolation intelligente et automatique, manuellement ajustable, rapide et légère.

## Décision automatique

Consultation/recherche/revue en lecture : aucun nouveau worktree. Une unité de code isolée utilise un worktree géré ; unités séquentielles compatibles peuvent réutiliser leur worktree. Écritures concurrentes utilisent des worktrees distincts. Un workspace partagé exige une preuve de non-conflit et une admission explicite du contrôleur. Les agents proposent ; le contrôleur possède les mutations Git structurées et leur admission. Aucun Git destructif exécuté librement pour résoudre un conflit.

Base capturée : repository/common Git directory canonique, HEAD exact, branche et état sale, worktree ID, agent/unité/objectif et révision. La branche par défaut ne remplace jamais implicitement le contexte courant. Si une modification humaine locale nécessaire n'est pas dans HEAD, la préserver et transporter explicitement un snapshot/patch sourcé vers le workspace isolé, ou suspendre l'admission si son attribution est ambiguë. Ne jamais ignorer silencieusement les changements locaux.

## Cycle durable

Planifier → réserver → créer/réutiliser → travailler → produire diff/receipt → vérifier → intégrer → vérifier composition → retenir/nettoyer. Réservation et tentative ont ID stable et état durable sous contrôleur unique. Après crash, inspecter Git et les receipts avant retry : pas de deuxième branche/worktree par simple absence de réponse. Un worktree n'est pas une sandbox et ne donne aucun accès nouveau.

Chaque receipt code porte base SHA, objectif/révision, worktree/agent IDs, fichiers touchés, patch ou commits proposés, commandes de validation et résultats. Git diff/commit n'est pas une preuve de réussite du goal. Avant intégration : vérifier sources et HEAD cible courant, état humain local, conflits et tests pertinents. Intégration sérialisée par dépôt sous ownership contrôleur ; Git lock files seuls ne constituent pas ce protocole. Résultat obsolète reste historique, nécessite redérivation/revue avant admission.

Conflit : conserver les deux contributions, afficher cause/fichiers, proposer une résolution dans workspace contrôlé, tester composition. Aucun reset --hard, clean -fd, suppression forcée de branche/worktree ou réécriture d'historique pour masquer le conflit. Commits locaux limités à la contribution attribuée et vérifiée ; push/publication/merge distant suivent l'autorisation propriétaire existante, aucun droit nouveau.

Nettoyage : uniquement worktrees créés et enregistrés par le harness, sans worker actif, avec changements/commits non intégrés préservés dans un artefact récupérable et vérifié. Ne jamais enlever un worktree externe ou primaire. Reprise/annulation garde les changements inspectables et les identités. Git absent/non-repo : état explicite, consultation possible, aucune fausse isolation.

## Performance et UX

Aucun worktree par modèle, appel ou consultation. Création paresseuse, réutilisation par unité compatible, concurrence bornée. Pas de clone/fetch/install automatique systématique. Cache metadata immutable par SHA ; état mutable invalidé après mutation, correction et juste avant admission. Pas de polling récursif du dépôt pendant la saisie ; opérations hors rendu. Mesurer durée création/statut/intégration, espace disque, appels Git et tokens. Modèle reçoit base, statut compact et fichiers utiles ; diff complet récupérable à la demande, secrets et autorité inchangés.

Palette Agents : workspace/branche/base, phase de validation/intégration, conflit et travail conservé ; détails à la demande. L'utilisateur exprime son intention, sans devoir gérer les worktrees. Override propriétaire possible sans multiplier les choix obligatoires.

## Graphe fini et critères

H06.3a : inventaire read-only et décision déterministe d'isolation ; Git absent, dépôt sale, consultation sans création, base courante exacte.
H06.3b : gestionnaire durable création/réutilisation/reconciliation ; deux workers réels isolés, interruption entre création et receipt, changements locaux préservés, aucune mutation de worktree externe.
H06.3c : receipts/intégration sérialisée/validation ; cible déplacée, correction R+1, conflits, composition échouée conservée et résultats obsolètes refusés.
H06.3d : vue terminal et cleanup récupérable ; clavier/resize/draft préservés, zéro I/O lourd au rendu, récupération après cleanup vérifiée, métriques locales bornées.

Tests dans dépôts temporaires locaux, sans réseau ni repo utilisateur : branches, dirty tree, fichiers non suivis, symlinks/path aliases, processus concurrents, arrêt/crash, répétition idempotente, disque/permissions refusés et intégration conflictuelle. Full/build/différentiel avant chaque livraison runtime. Risques élevés isolation/admission/recovery restent ouverts jusqu'aux preuves. Auth distante/deploy N/A ; aucune promesse de confinement OS ou performances non mesurées.

### Admission du premier lot H06.3a

API adapter read-only asynchrone : inventory cwd canonique, dépôt/common directory, HEAD ou unborn, branche/detached, dirty flag sans transporter les noms de fichiers. Commandes Git argv structurées, aucun shell ; environnement Git ambiant ne redirige pas le dépôt. Sortie bornée et timeout technique/cancellation, échec observé distingué de non-repo. Décision pure lecture → shared-read sans worktree ; écriture non-repo/HEAD unborn/inventaire échoué → unavailable ; état sale → requires-snapshot sans effet ; état clean → isolated-write, worktree existant réutilisable seulement si même repository/base/unit, inactif et propre. Cette première API ne crée et ne sélectionne aucun workspace du runtime ; H06.3b/c/d restent requis avant code-agent effects.

Inventaire : observation bornée, pas verrou atomique du filesystem ; HEAD relu en fin de lecture mais index/fichiers peuvent changer ensuite. Le manager H06.3b/c doit réinspecter sous réservation avant mutation/intégration. Les candidats de réutilisation proviennent du registre contrôleur, jamais d’un payload modèle ; leur propreté et ownership devront être vérifiés physiquement à l’admission. Les recommandations de H06.3a ne donnent aucune permission d’exécuter.

### H06.3b1 — allocation locale durable bornée

Manager adapter reçoit repository, racine de gestion propriétaire, allocation ID slug, unité/agent/objective/révision attendue et base SHA. Inventaire revalidé clean/exact avant réservation exclusive fichier wx/fsync. Aucun chemin fourni par modèle. Worktree detached à base exacte, argv sans shell, hooks Git désactivés pour cette opération. Racine canonique propriétaire hors dépôt et non symlink ; allocations attribuées et jamais supprimées. ID existant conflit attribution/base refusé. Concurrent ID pending propriétaire vivant → busy. Après owner disparu, seulement réconcilier un worktree effectivement enregistré/HEAD/base/commun Git propres ; chemin absent/incomplet reste uncertain, jamais seconde création implicite. Receipts ready fsync append-only. Retour ne signifie pas worker admis ou travail intégré. Réutilisation d'ID ready nécessite vérifier propriété/HEAD/propreté ; utilisateur a modifié → refuse sans nettoyer. Branches, initialisation outils et effet worker hors lot. H06.3b parent reste ouvert pour réservations multi-unités/quotas, snapshot dirty, disparition descendants et admission runtime.

Défaut découvert H06.3a1 (P1) : git status/checkout peut lancer core.fsmonitor et filters clean/smudge/process depuis config locale. Désactiver fsmonitor sur inspection ; détecter les filtres configurés avant status et refuser l’inventaire d’écriture avec cause explicite plutôt que les exécuter. Allocation désactive hooks/fsmonitor/submodule.recurse. Cela ne prétend pas confiner Git au kernel ; config/root host malveillant/races restent R06 ouverts. Inventaire passe à six commandes bornées pour couvrir ce contrôle. Tests canary fsmonitor/filter/hook.

Finalisation : claim fichier exclusif court, relecture sous claim avant append receipt ; deux réconciliateurs ne produisent pas deux receipts. Claim laissé avant receipt après crash demande inspection explicite, aucun effacement/reclaim automatique fondé sur horloge. Test racine inclut nom commençant par deux points, qui reste un enfant du dépôt et est refusé. Lot conserve les résultats incertains au lieu de les effacer.
