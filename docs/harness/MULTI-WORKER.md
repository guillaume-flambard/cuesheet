# Workers de code isolés — H06.2

Le contrôleur décompose automatiquement un objectif en unités utiles. Chaque
worker reçoit le même objectif/révision, ses références de mémoire et ses skills,
un modèle configuré et un worktree propre à son unité. L'utilisateur corrige
normalement la conversation : la correction est immédiatement inscrite et
invalide toutes les propositions devenues incompatibles, sans file de messages.

## Modèle et frontières

Le terminal est le seul écrivain du journal commun. Les workers ont leurs
journaux d'effets privés, leurs scopes calculés et leurs processus fournisseurs.
Un effet en cours d'un worker vivant ne devient pas une permission de contourner
le verrou des effets incertains du contrôleur. Un worker ne peut appeler finish,
integrate_workspace, prepare_workspace ni modifier un autre journal ou la source.
La première version admet au maximum deux workers de code. Les consultations
existantes restent sans effets. Aucune modification de src/core n'est requise.

Flux : proposition de tâches → validation complète du lot → routes owner →
snapshot commun → allocations distinctes → admission sourcée → boucles privées
→ captures → vérification owner → intégrations séquentielles → vérification
indépendante du résultat composé. Une réponse textuelle ne vaut jamais preuve.

Les fichiers annoncés sont des responsabilités pour détecter un conflit de plan,
pas une barrière de sécurité : l'exécuteur et le worktree portent l'isolation.
Les modifications réellement capturées doivent aussi respecter le scope avant
intégration. Les chemins, capacités, branches, image et budgets owner ne viennent
jamais d'un document ou d'une sortie modèle.

## Critères et graphe fini

| Tâche | Priorité | Critère | Vérification |
| --- | --- | --- | --- |
| H06.2a | P0 | REQ-H06.2 / AC-H06.2a : lot de 1–2 tâches strict, rôles distincts, fichiers relatifs sûrs et responsabilités sans recouvrement ; lot invalide refusé avant effet ; données détachées de la proposition | tests validation, chemins Windows/POSIX, conflit parent/enfant, charge bornée et mutation tardive |
| H06.2b | P0 | AC-H06.2b : routes configurées et deux worktrees distincts avant effets ; deux processus réels exécutent dans leurs scopes ; aucun fallback fournisseur | tests runtime/Git/processus réels et receipts |
| H06.2c | P0 | AC-H06.2c : journaux privés et admission conditionnelle, aucun finish/intégration enfant ; le contrôleur conserve seul l'autorité | effets simultanés, effet null, appel interdit, correction pendant admission |
| H06.4a | P0 | AC-H06.4a : correction directe arrête les effets futurs et écarte les réponses R ; les changements déjà produits restent inspectables | correction pendant inférence/outils, redérivation R+1, kill après écriture avant receipt, reopen sans replay aveugle |
| H06.3c2 | P0 | AC-H06.3c2 : résultat composé vérifié, conflits et drift refusés, source/index préservés en refus | deux deltas disjoints puis conflit réel, check rejeté, intégration partielle incertaine et reprise |
| H06.5c | P1 | AC-H06.5c : UI montre responsabilités, modèle, phase, contribution et consommation sourcées ; restart affiche interruption | PTY clavier/resize, projection historique, tokens inconnus explicites |

Dépendances : a → b → c → 4a → 3c2 → 5c. Les parents H06.2/3/4/5
ne sont pas clos par une tranche. Specs/API détaillées des étapes suivantes
doivent être précisées avant leur implémentation ; leurs critères sont ouverts.

## Risques, reprise et coût

R06 reste élevé : partager activeWorkspace/activeEffect ou le store mémoire
actuel entre workers créerait une attribution incorrecte. Utiliser des contextes
privés et un contrôleur seul écrivain, jamais Promise.all(currentTools.run).
Toute allocation partielle reste attribuée et inspectable ; pas de nettoyage
automatique d'un worktree dirty. Après crash, aucun ancien active n'atteste un
processus vivant : réconciliation requise avant reprise des effets.

Pas d'appel modèle supplémentaire pour valider le plan. Bornes fixes sur tâches,
fichiers et texte. Contexte partagé compact et lectures référencées à la demande,
aucune copie systématique de transcript privé. Offline/reseau/permissions suivent
les routes existantes. Pas de déploiement, migration destructive, achat ni push.
Compatibilité : anciens journaux et consultations inchangés ; UI réutilise la
palette Agents. Auth distante et synchronisation entreprise restent aux parents.

H06.2a vérifié borné : [EV-WORKER-PACKETS](evaluation/worker-packets/evidence.md). Adaptateur pur non raccordé ; tous les critères runtime des étapes suivantes restent pending.

## H06.2b1 — préparation atomique du lot avant exécution

Le contrôleur valide et copie le lot complet, résout toutes les routes configurées
avant toute allocation puis capture une seule base/source dirty. Les allocations
sont distinctes, controller-owned UUID, et séquentielles ; aucune boucle modèle
ne démarre avant disponibilité de tout le lot et revalidation de la source et
du contrat. Les callbacks de route sont owner-only et ne reçoivent aucun chemin
modèle. Le journal commun enregistre preparing/ready ou refused/uncertain/stale
avec IDs, paths et provenance. Une allocation partielle est conservée, jamais
effacée ; un échec empêche la publication du lot comme prêt. Cette étape ne
prouve pas encore exécution parallèle, isolation des effets ni intégration.

AC-H06.2b1 : deux worktrees réels depuis source dirty/staged intacte, aucun appel
infer, refus route avant allocation, correction en préparation sans ready,
source drift refusé et aucun fallback. Vérification Git réel et chemins de refus.

## H06.2c1 — boucle privée et admission de chaque effet

Adaptateur de boucle bornée owner (1–8 inférences), modèle déjà résolu et
exécuteur déjà scoppé. Chaque callback append privé doit persister avant retour.
Un intent lié à un effect ID propre est inscrit avant chaque appel externe, puis
un receipt lié seulement si exit entier est confirmé. Exit null, exception
après intent ou correction pendant effet termine en uncertain ; aucune répétition
automatique. Les outils déclarés viennent uniquement de owner allowlist, jamais
des tâches ; prepare/integrate/finish/git et capacités de gouvernance sont exclus.
Avant chaque inférence et chaque effet : signal et contrat courant contrôlés ;
inférence tardive après correction écartée. Aucun texte ou sortie outils ne
ferme un goal. Append en échec bloque les effets ; pas de transcript privé
communiqué automatiquement. Les deux workers ne partagent aucun champ mutable.
AC-H06.2c1 : effets simultanés attribués séparément, null sans receipt/retry,
outils interdits non exécutés, correction pendant inférence et entre deux outils,
append échoué avant intent et exécution bornée. Raccordement runtime/journal
durable effectif et processus fournisseurs encore aux parents.

## H06.2c2 — branchement terminal durable

Le contrôleur expose run_code_workers uniquement quand stockage, factory modèle
scoppée et factory outils worker sont configurés. Admission et garde des effets
incertains du parent inchangées : un seul intent parent recouvre le lot. Toute
contribution parent pending bloque finish et intégration du builder ; workers
ne ferment jamais goal. Préparation du lot puis création de journaux TerminalSession
privés sous sessions/workers/session-parent ; routes rebondées au worktree avant
inférence. Factory Container lit seulement le journal privé correspondant pour
admettre et tracer ses ressources, et transmet le signal direct. Tous les journaux
sont ouverts avant la première boucle. Échec partiel conservé, pas de replay.

Le journal commun porte terminal.agent (skills/modèle/phase) et terminal.code-worker
(provenance/workspace/journal/phase) ; Agents affiche contribution et reprise à
inspecter. Reopen ne lance pas de worker automatiquement. Frames combinent
contexte partagé courant, situation worker et observations privées bornées ;
skills sélectionnés par rôle avant exécution et revalidés à chaque admission.
Deux boucles Promise.all sur contextes privés, jamais currentTools partagé.
Critère AC-H06.2c2 : vrai producer/journal et deux processus, outputs utilisés
à linférence suivante, correction immédiate sans nouvelle session, journaux
réouverts avec receipts, phase interrupted après reload et finish refusé pour
contributions non intégrées. Le choix dintégration/récupération demeure parent
H06.3c2/H06.4a ; aucun résultat complet selfhost revendiqué avant ces critères.

Défaut découvert H06.2c2-D1 : une correction ordinaire persistait bien R+1
mais les workers en inférence sans réponse pouvaient rester actifs. Un
AbortController de lot distinct du parent est maintenant annulé après persistance
de la correction. Le parent reste dans la même exécution et retrouve le contexte
frais ; aucun message queued. Échec reproduit par wait15s, puis test PASS.
Frame final worker plafonné avant inférence (48k caractères ou budget owner),
observations privées bornées ; dépassement refuse sans supprimer une contrainte.
Publication des résultats via allSettled pour attendre les autres workers avant
fermeture des journaux, même si une publication échoue.

## H06.3c2a — composition et intégration contrôleur

integrate_code_workers {} sélectionne uniquement le lot ready du journal parent
et ses workers proposal au contrat courant. Les journaux privés sont réouverts
avec claim ; effet incertain ou processus actif refuse. Les chemins/journaux/
scopes sont recalculés et attestés depuis les admissions owner ; aucune entrée
modèle ne sélectionne un fichier ou ne lie un check. Les deltas réels sont
calculés tous contre la même source/base épinglée avant toute écriture ; chaque
chemin doit être annoncé dans le paquet et les deltas de workers ne doivent
pas se chevaucher (parent/enfant, casse ou normalisation Unicode compris).

Créer une composition worktree controller-owned depuis la source dirty, puis
y appliquer les deltas sans toucher la source. Vérifier captures workers/source
avant et après copie, et comparer le delta composé exactement à lunion des
deltas admis. Limites100 fichiers/4MiB par plan conservées ; copie de fichiers
réguliers seulement, aucune installation/commande modèle durant composition.
Le check owner épinglé au contrat courant valide le résultat composé ; aucune
validation texte enfant. Ensuite plan composition→source existant, rechecks
digest/contrat, application récupérable sous claim Git. Refus pré-apply laisse
source/index/HEAD intacts ; apply partiel retourne null/uncertain et préserve
composition/plan. Après applied, marquer le lot intégré et déverrouiller finish
qui reste un check indépendant de la source. Les contributions et compositions
ne sont jamais nettoyées automatiquement dans ce lot.

AC-H06.3c2a : deux deltas disjoints intégrés sans réversion du premier, source
dirty/index préservés ; scope réel hors paquet, conflit, drift, journal incertain,
ancien contrat ou check refusé => source intacte ; composition et plan attribués
persistés ; finish ne ferme que via check indépendant. Tests Git réels/runtime,
full/build ; cleanup/crash recovery reste parent, risque R06/R09 ouvert.
