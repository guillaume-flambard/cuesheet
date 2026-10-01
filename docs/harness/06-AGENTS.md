# H06 : agents temporaires et objectifs communs

## Résultat

Le harness délègue lorsqu'une séparation utile existe, avec tous les workers
reliés au même état de travail. Un remplacement d'agent conserve décisions,
preuves et questions. L'utilisateur n'organise pas les rôles et les messages.

## Admission et responsabilité

Une délégation porte worker ID, objectif et révision, unité de travail, résultat
attendu, scope de lecture/écriture, capacités et budget. Les rôles peuvent être
recherche, construction, revue ou contrôle ; ils sont choisis selon le besoin,
pas instanciés systématiquement. Un worker n'acquiert pas l'autorité de valider
sa production par son rôle ou son nom.

Réutiliser `temporaryWorker`, `worker-launcher`, les receipts et le store durable.
Le journal est la communication commune : les résultats sont publiés en records
sourcés. Une conversation privée n'est pas le seul endroit où vit une décision.
La demande humaine modifie immédiatement l'état commun, sans attente derrière
une file d'exécutions devenues obsolètes.

## Écriture et concurrence

Le terminal actuel possède une claim exclusive. Choisir et documenter la première
architecture réelle : contrôleur seul écrivain avec workers produisant des receipts,
ou transactions conditionnelles du store durable. Recommandation initiale : un
contrôleur seul écrivain, afin de conserver les garanties du journal terminal.
Les workers ne partagent pas naïvement des EventStore en mémoire.

Avant admission d'une sortie, vérifier la révision de travail utilisée, les
modifications pertinentes, le scope et les sources. Un résultat devenu obsolète
peut être conservé comme artefact historique sans engager le contrat courant.
Relecture et redérivation traitent les conflits. Une révision artificiellement
mise à jour sur un résultat ancien ne constitue pas un rebase.

Par défaut isoler les écritures de code concurrentes dans des workspaces distincts.
Associer base Git, patch ou capture au receipt. Intégrer explicitement et vérifier
le résultat composé. La partition d'un espace commun demande une démonstration
de non-conflit. Les worktrees créés par le harness sont suivis et nettoyables.

## Vie des workers

Enregistrer admission, début, observation, terminaison, disparition et résultat
incertain. Un heartbeat établit la vie d'un processus, pas la progression de son
objectif. Annuler les workers incompatibles avec une correction. Remplacer un
worker disparu depuis la projection commune, après reconciliation de ses effets.
La reprise transmet décisions et références utiles, pas toute sa conversation.

## Acceptation et tâches

- [ ] H06.1 Contrat de délégation et choix automatique de rôles utiles.
- [ ] H06.2 Deux vrais processus sur un état commun avec admission conditionnelle.
- [ ] H06.3 Isolation, intégration des artefacts et validation du résultat composé.
- [ ] H06.4 Correction humaine, rebase, arrêt et remplacement après crash.
- [ ] H06.5 Affichage des responsabilités et consommation cumulée.

Tests : deux workers vrais, sorties concurrentes, correction à R+1, receipt fondé
sur R refusé, travail compatible redérivé, worker tué après écriture avant receipt,
intégration conflictuelle, arrêt de tous les workers, lecture commune d'une décision
sans message privé, remplacement par un autre modèle. Un test seulement intercalé
dans un processus ne valide pas la concurrence réelle.

Dépendances : H01, H03, H05, H09. Lire `docs/SW-01-shared-work-state.md` pour
les garanties existantes et leurs limites ; ne pas annoncer qu'elles prouvent déjà
le runtime multi-processus terminal.
