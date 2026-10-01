# Continuité : tranche d’implémentation H05.2/H05.3

Défaut observé : producer appelle une boucle unique maxSteps=8 puis termine le run avec budget-exhausted, même après des observations nouvelles utiles.

Contrat : un run explicitement démarré peut avancer sur quatre tranches maximum par défaut, huit inférences par tranche. maxSlices est configurable 1–16. Toute tranche repart du journal courant et les steps présentés au modèle sont monotones. Aucun chargement de session ne lance ces tranches. Abort est vérifié avant chaque tranche et nouvelle inférence. Goal-closed/blocked/erreur terminent sans relance ; l’objectif survit à la limite.

Chaque limite de tranche garde une note terminal.execution (executionId, tranche, état, steps, budget, coût inconnu). La poursuite exige une observation nouvelle d’outil réussi, identifiée par nom+entrée+sortie ; paroles et outils de bookkeeping ne constituent pas un progrès. Une tranche sans observation nouvelle arrête la continuation et conserve stagnation comme cause. Cette heuristique ne prouve pas le progrès métier : H05.3 complet et métriques d’acceptation restent ouverts.

Vérification : tâche >8 inférences avec processus réel et check épinglé ; frontière de tranche après correction ; annulation à cette frontière ; répétitions et paroles seules ; plafond ; aucun lancement au replay. Préférences persistantes, dépenses provider exactes, effets incertains et états complets H05.1/H05.4/H05.5 restent ouverts.

Implémentation ciblée vérifiée : 29 tests passent, incluant tâche réelle en dix inférences. CUESHEET_MAX_SLICES règle le plafond (défaut 4, 1–16), validé avant lancement. Identité de source path/url+digest remplace seq/date dans la comparaison de lectures répétées. Les événements core gardent step local de tranche ; les notes executionId/slice et steps cumulés lèvent cette ambiguïté.


## Tranche H05.1/H09.1 : état d’exécution et replay

Les notes terminal.execution v1 existantes restent lisibles sans réécrire les journaux. Ajouter une projection pure validant budgets, compteurs monotones, transitions running → continuing → running ou état terminal ; refuser réutilisation d’ID clos, transition impossible, version inconnue et budget modifié au milieu d’un run. Les nouvelles notes lient objectif/contrat quand disponibles, les anciennes gardent provenance inconnue.

Les échecs et arrêts publient failed/cancelled lorsque le journal reste inscriptible. L’erreur d’origine reste la cause rapportée même si cette dernière écriture échoue. Un crash laisse running/continuing dans l’historique ; au chargement seulement, la projection indique interrupted sans append et sans relance. La vue indique cause/compteurs/actions possibles sans prétendre à une vérification supplémentaire. Le contexte partagé expose les états récents sous son plafond existant.

Vérification : transitions/budgets invalides refusés avant append ; corruption refusée au reload sans modifier le journal ; crash réel existant avec assertion d’identité/état ; run terminé conservé ; cancellation et provider error explicites ; chargement aucune inférence/effet. Les attentes d’information/capacité fines et H05.4 restent ouvertes : les états de cette tranche décrivent les observations actuellement disponibles.


## Tranche H05.4 : effets incertains

DISCOVER : terminal.intent requested est écrit avant dispatch mais sans reçu lié ; core écrit résultat après retour. Un crash dans cet intervalle garde une intention sans résultat et la reprise repose actuellement sur une instruction au modèle.

MODEL/SPECIFY : conserver l’ID seq de l’intention. Reçu terminal.receipt v1 completed avec intentSeq, tool, exit et digest de sortie, écrit avant de rendre le résultat au core. Reçu manquant après interruption = effet incertain, jamais résultat inventé. Anciens journaux : associer seulement l’observation existante du même outil dans l’intervalle série avant l’intention suivante ; absence reste inconnue. Le replay ne réécrit pas ce format.

DECOMPOSE H05.4 : projection/paires et validation → reçu de dispatch → garde de reprise → reconciliation appuyée sur source réelle → tests crash/cancel/échec journal/compatibilité. Gate : tant qu’une mutation passée reste incertaine, seuls cat/ls et outils internes de lecture/organisation sont admis ; finish et mutations refusés. reconcile_effect {intentSeq, observationSeq, conclusion, rationale} admet une conclusion de modèle performed/not-performed/inconclusive seulement après observation cat/ls réussie, postérieure à l’intention, issue du core. Elle ne constitue pas une preuve d’acceptation. Inconclusive laisse la garde. Une conclusion performed interdit de répéter la même invocation dans cette exécution de reprise. Aucun exactly-once universel revendiqué.

Vérification : écriture réelle puis interruption avant résultat, reload sans dispatch, mutation tentée refusée, lecture puis reconciliation source liée, pas de double append ; résultat completed mais core result absent ; conclusion sans source/relecture vieille rejetée ; historique compatible ; reçu corrompu refuse sans réécriture. Coût/capacité inconnus, compensations et idempotency providers restent à traiter dans H05.4 complet.
