# H02 : choix automatique du travail

## Résultat

Le harness décide des étapes et des outils utiles à partir de l'objectif courant,
des observations, des capacités disponibles et des limites autorisées. Il explique
ses décisions importantes sans demander à l'utilisateur de piloter sa mécanique.

## Boucle

À chaque frontière sûre : reconstruire l'état à sa révision ; identifier ce qui
manque pour avancer ; proposer une action ; valider son périmètre, sa forme et sa
révision ; enregistrer son intention ; exécuter ; enregistrer l'observation ;
recalculer le travail. Cette boucle reste indépendante du provider.

La décision peut être model-backed. Le runtime contrôle réellement la validation,
l'admission et les transitions : une directive seule ne suffit pas à démontrer
que le produit prend les bonnes décisions. Le choix contient une justification,
des sources, l'objectif et sa révision, les capacités requises et un résultat
observable attendu. Une proposition obsolète doit être redérivée, pas simplement
rejouée avec un nouveau numéro de révision.

## Étapes adaptatives

Évaluer, rechercher, spécifier, planifier, construire, vérifier et revoir sont des
possibilités, pas une chaîne obligatoire. Une correction minime peut passer de
l'inspection à la modification puis au contrôle. Une feature ambiguë peut exiger
une spec. Plusieurs tâches dépendantes peuvent exiger une checklist. Une
documentation absente peut exiger une recherche. Un échec de vérification déclenche
une analyse de l'observation puis une nouvelle action adaptée.

Specs : problème, résultat, scope, critères, contraintes, inconnues et sources.
Tâches : ID, objectif, dépendances, état, base de décision et résultat attendu.
Matérialiser les documents utiles comme artefacts versionnés et accessibles,
sans écraser une spec rédigée par la personne. Éviter les multiples fichiers de
planification divergents. Les plans historiques restent consultables.

Les questions humaines portent sur une information indispensable ou une action
dépassant le périmètre confié. Les choix techniques réversibles dans ce périmètre
restent automatiques. Une information manquante sur une branche n'arrête pas les
branches indépendantes.

## Revue et échec

Prévoir une revue du résultat lorsque le risque ou le contrat le demande. Un
autre worker peut relire ; sa revue reste distincte d'une preuve d'exécution.
Diagnostiquer : mauvaise réponse modèle, capacité absente, conflit, contrat
ambigu, problème d'outil, problème provider, problème de stockage. Choisir une
réponse liée à la cause. Détecter la répétition sans progrès et changer de
stratégie ou signaler le blocage, avec preuve de la répétition.

## Acceptation et tâches

- [ ] H02.1 Décision structurée et admission runtime liées à l'objectif courant.
- [ ] H02.2 Specs et tâches stables, versionnées et matérialisables.
- [ ] H02.3 Politique de processus léger, questions nécessaires et travaux indépendants.
- [ ] H02.4 Revue, diagnostic d'échec et adaptation observable.
- [ ] H02.5 Scénarios avec providers réels, en complément des fixtures scriptées.

Scénarios : tâche triviale sans spec inutile ; feature nécessitant spec ; besoin
de doc déclenchant recherche ; échec du test modifiant le plan ; indisponibilité
d'outil rapportée honnêtement ; correction humaine redirigeant l'exécution ;
action hors périmètre non exécutée ; statut « done » proposé sans preuve refusé.
Comparer aussi l'état produit aux changements réels des fichiers et du journal.

Dépendance : H01. Raccordements : `work-organizer.ts`, `work-worker.ts`,
producer terminal et adaptateurs d'outils.
