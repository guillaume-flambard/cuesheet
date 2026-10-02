# Consultation multi-agent — lot H06.1a/H06.5a

Intention : le coordinateur choisit automatiquement des analyses parallèles utiles. La personne continue à écrire dans le même composer, sans file ni nouvelle session. Résultats sourcés consultables depuis la palette, jamais preuves de réussite.

Existant : temporaryWorker et revision guards ; worker-launcher et receipts ; create_skill/organize_work ; provider binding sélectionnable ; claim terminal unique. Réutiliser ces frontières, aucun changement core.

Flux : tools declaration → consult_agents {tasks:[{role,task}]} → contrôleur seul écrivain → notes admission/active → inférences parallèles sur frame partagé sourcé sans outils → résultats bornés → notes result/failed/stale/cancelled → observation commune → inférence coordinateur suivante. Chaque tâche hérite du modèle actif autorisé ; aucun provider payant de secours. Un changement du binding annule ses inférences existantes. Pas de modèle choisi par contenu de document.

REQ-H06.1/2/4 : 1–3 tâches, rôle slug≤48, task≤4000, batch rejeté avant appel si invalide. Identités uniques, parent execution/objective revision, modèle déclaré, contexte courant. Résultat textuel≤8000, tool calls refusés et jamais exécutés. Erreur d'un agent ne supprime pas les autres. Correction directe change la base : anciennes sorties historiques seulement, aucun réétiquetage en nouveau contexte. Annulation ne laisse pas de résultat tardif admis. Reload affiche histoire, active ancien devient interrompu ; lecture pure, aucun restart automatique. Parents H06 restent ouverts : vrais processus multi-write, autorisations de routes distinctes par agent, budgets cumulés, rebase/remplacement/workspaces et intégration.

REQ-H06.5/H08.3 : palette « Agents », rafraîchissement en lecture pendant run, rôle/modèle/tâche/statut/résultat, état vide explicite. Scroll/pagination existants, Escape conserve composer, largeur40/80/120 et resize ; texte contrôleur nettoyé contre escapes. Pas de nouveau panneau permanent ni popup à chaque agent. Notes timeline courtes de démarrage/fin.

AC tranche : deux agents effectivement simultanés ; tools interdit ; une erreur isolée ; correction pendant attente rend sortie stale ; stop bloque résultat tardif ; invalid input n'appelle aucun modèle ; relecture sans mutation ; vraie touche palette et scroll à trois tailles. Cible : unit/integration producer + Ink + régression context/model + typing differential + full/build.

Graphe fini : H06.1a contrat et consultation runtime (P1) → H06.5a projection/UI agents (P1). H06.2/3/4 restent parcours multi-processus et écriture à intégrer. Auto-amélioration H04.5 reste évaluation/promotion, ne pas confondre create_skill déjà livré et amélioration mesurée.

Risques : consommation 3 appels supplémentaires bornés, coûts inconnus restent inconnus ; données reçues identiques au provider déjà choisi ; résultats non fiables sans permission ni autorité ; pas de confinement kernel supplémentaire des providers. Timeout technique du provider inchangé, aucun timeout global ajouté. Auth réseau, export/import, worktrees, vecteurs N/A pour ce lot (parents séparés). Performance :3 max, text24K max, projection20 agents/page. Documentation et package existants mis à jour/testés, rollback commit sans migration du journal.
