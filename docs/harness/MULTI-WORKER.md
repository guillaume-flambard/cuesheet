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
