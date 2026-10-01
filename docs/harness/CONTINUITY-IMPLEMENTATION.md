# Continuité : tranche d’implémentation H05.2/H05.3

Défaut observé : producer appelle une boucle unique maxSteps=8 puis termine le run avec budget-exhausted, même après des observations nouvelles utiles.

Contrat : un run explicitement démarré peut avancer sur quatre tranches maximum par défaut, huit inférences par tranche. maxSlices est configurable 1–16. Toute tranche repart du journal courant et les steps présentés au modèle sont monotones. Aucun chargement de session ne lance ces tranches. Abort est vérifié avant chaque tranche et nouvelle inférence. Goal-closed/blocked/erreur terminent sans relance ; l’objectif survit à la limite.

Chaque limite de tranche garde une note terminal.execution (executionId, tranche, état, steps, budget, coût inconnu). La poursuite exige une observation nouvelle d’outil réussi, identifiée par nom+entrée+sortie ; paroles et outils de bookkeeping ne constituent pas un progrès. Une tranche sans observation nouvelle arrête la continuation et conserve stagnation comme cause. Cette heuristique ne prouve pas le progrès métier : H05.3 complet et métriques d’acceptation restent ouverts.

Vérification : tâche >8 inférences avec processus réel et check épinglé ; frontière de tranche après correction ; annulation à cette frontière ; répétitions et paroles seules ; plafond ; aucun lancement au replay. Préférences persistantes, dépenses provider exactes, effets incertains et états complets H05.1/H05.4/H05.5 restent ouverts.

Implémentation ciblée vérifiée : 29 tests passent, incluant tâche réelle en dix inférences. CUESHEET_MAX_SLICES règle le plafond (défaut 4, 1–16), validé avant lancement. Identité de source path/url+digest remplace seq/date dans la comparaison de lectures répétées. Les événements core gardent step local de tranche ; les notes executionId/slice et steps cumulés lèvent cette ambiguïté.
