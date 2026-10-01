# H01 : intentions, objectifs et critères

## Résultat

L'intention de la personne devient un ensemble d'objectifs identifiables et
révisables. La personne peut changer le résultat attendu en parlant normalement.
Une modification conserve l'historique et invalide les engagements devenus
obsolètes. Un objectif commun peut être poursuivi par plusieurs workers.

## Contrat de données

Définir au niveau applicatif un schéma versionné d'événements utilisant les kinds
existants. Réutiliser le journal et les projections avant d'introduire une nouvelle
primitive core. Les payloads nouveaux sont validés avant append et à la lecture.

Chaque intention porte un identifiant stable, texte original, auteur et sources.
Chaque objectif porte : identifiant stable, intention parente, description,
périmètre, exclusions utiles, dépendances, révision du contrat, critères
d'acceptation, contraintes, responsable éventuel et état.

États distincts : proposé, actif, bloqué, suspendu par la personne, validé,
abandonné, remplacé. Une tranche épuisée est un état d'exécution, pas un état
terminal d'objectif. Une tâche terminée par le modèle reste une déclaration
jusqu'à sa vérification. Définir explicitement le mapping avec le goal core actuel
qui ne représente qu'un goal courant ; conserver les objectifs multiples au-dessus.

La spec, le plan et les tâches référencent l'ID et la révision de l'objectif.
Remplacer la clé actuelle fondée sur le texte. Deux objectifs de texte identique
restent différents ; une reformulation d'un même objectif conserve son identité.

## Création et modification automatiques

Le harness extrait un contrat proposé des échanges. Il distingue ce que la
personne a dit, ce qu'il déduit et ce qu'il a observé. Une hypothèse réversible
peut guider l'exécution avec son statut explicite. Une ambiguïté qui rend le
résultat indécidable devient une question ciblée, sans bloquer les travaux
indépendants. L'utilisateur n'a pas à choisir un mode de planification.

Une correction produit un nouvel événement et une nouvelle révision. Recalculer
l'impact sur tâches, workers, spec et preuves. Rebaser les travaux compatibles ;
arrêter les étapes incompatibles à leur frontière sûre. Un effet déjà produit
reste un fait historique, avec son éventuelle compensation explicitement suivie.

## Critères et autorité

Le harness peut générer automatiquement des tests et suggérer un critère à partir
de la demande. Marquer ces tests comme générés par le producteur. Un test généré
n'acquiert pas l'autorité d'un check propriétaire parce qu'il passe.

Associer chaque critère à sa provenance et à son niveau d'autorité : check déjà
déclaré, critère explicite utilisateur, hypothèse du harness. Épingler le contrat
avant validation. Le producteur ne peut le réécrire pour obtenir un résultat vert.
Quand une correction autorisée change le critère, ouvrir une nouvelle révision et
associer les nouvelles preuves à cette révision. Les anciennes preuves restent
historiques. Quand aucune validation indépendante n'est disponible, afficher
« produit, non vérifié » avec les critères qui restent à vérifier.

Les objectifs non logiciels peuvent utiliser une vérification documentaire ou
une revue humaine explicite. Leur état reflète la force réelle de cette preuve.

## Acceptation et tâches

- [ ] H01.1 Schéma et projections versionnés, identités stables, dépendances sans cycle.
- [ ] H01.2 Extraction automatique et traitement d'une correction conversationnelle.
- [ ] H01.3 Contrat d'acceptation versionné et provenance des checks générés.
- [ ] H01.4 Raccordement aux plans, mémoires, workers et preuves existants.
- [ ] H01.5 Migration lisible des anciens plans et goals, sans inventer de provenance.

Tests obligatoires : deux goals de texte identique ; reformulation conservant ID ;
preuve à R refusée pour R+1 ; correction pendant vérification ; critère réécrit
par le producteur ; objectif documentaire sans faux statut vérifié ; reload après
chaque mutation ; cycle de dépendances refusé sans append.

Points d'entrée : `src/adapters/work-organizer.ts`, `src/work-state.ts`,
`src/adapters/surface-verification.ts`, `apps/terminal/src/producer/index.ts`.
