# Notifications pertinentes — H08.3n

Statut SPECIFICATION, aucun canal activé. Prévenir sur résultat réellement vérifié, blocage exploitable, permission/question nécessaire ou échec demandant intervention. Progression normale, tool calls, nouvelle inférence et consultations ne notifient pas. Fin de tranche ou réponse modèle ne signifient pas goal terminé.

Projection des événements contrôleur sourcés : ID stable session/exécution/objectif/révision/cause, référence de preuve, message court, action pour retrouver le travail. Déduplication et état lu/non lu durables ; reprise du journal ne renvoie pas toutes les anciennes notifications. Corrections rendent les anciennes actions obsolètes. Agréger causes communes des agents, garder les détails inspectables. Aucun appel modèle pour produire une notification.

Terminal : indicateur discret et centre consultable, saisie/focus conservés. Bell optionnel ; desktop ultérieur via canal explicitement autorisé, disponibilité/permission/erreur distinctes. Confidentialité : pas de texte privé de spec/diff/secret envoyé au desktop par défaut. Modes silencieux/niveau manuel avec comportement sobre automatique. Aucun email/Slack/push externe implicite.

TODO H08.3n1 projection et classification factuelles → H08.3n2 dédup/lecture/replay durable → H08.3n3 centre terminal → H08.3n4 canal local optionnel. Tests bloqué/goal ouvert/fermé vérifié, événements répétés/replay, nouvelle cause, correction, refus canal, clavier/resize et zéro inference. Performance : consommation incrémentale du journal, aucune boucle de polling du repo, métriques dispatch/latence sans prompts. Ce chantier appartient à H08.3/H08.5, non livré.
