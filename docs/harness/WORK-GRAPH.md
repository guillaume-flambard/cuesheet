# Graphe fini du chantier

Source machine : state.json, tableau `tasks`. Chaque tâche possède priorité,
statut, exigences, dépendances, systèmes, AC, méthode et preuve. TODO.md reste la
vue lisible par lots. ACCEPTANCE.md est la vue lisible des AC. Les trois doivent
être mis à jour ensemble ; DONE nécessite une preuve durable vérifiée.

DISCOVER/MODEL : SYSTEM-MAP, README et STATUS distinguent existant/intention/preuve.
SPECIFY : H01 à H10 et ACCEPTANCE. DECOMPOSE : tâches finies de state.json.
IMPLEMENT/VERIFY : sélectionner la portion indépendante d'une tâche READY ou
IN_PROGRESS, consigner preuve puis recalculer downstream. CLOSE : audit final de
VERIFICATION, zéro P0/P1, zéro AC en attente/échoué, zéro risque HIGH/CRITICAL ouvert.

Le protocole est adopté après les commits d'objectifs et de contexte. Les tâches
globales H01/H03 restent IN_PROGRESS car ces commits n'en couvrent qu'une partie.
Les tâches B00 sont DONE avec EV-B00. Le reste n'est pas marqué achevé par déduction.

Découverte requise : H07.2a, mauvais nom de capacité dans le frame, lié à R08 et
REQ-H07.2a. Sa reproduction précède toute correction core. Les autres diagnostics
hérités restent visibles ; leur existence ne donne pas autorisation à un fix bulk.

Le statut global IMPLEMENTING ne signifie pas READY_FOR_MANUAL_ACCEPTANCE. Les
essais externes indisponibles restent ouverts sans bloquer le travail indépendant.
Une priorité P0/P1 n'est pas rétrogradée pour accélérer une clôture.
