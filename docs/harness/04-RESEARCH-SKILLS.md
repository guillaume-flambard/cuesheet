# H04 : recherche, documentation et skills

## Résultat

Le harness recherche lorsqu'il manque une information vérifiable, charge les docs
appropriées et réutilise ou crée un skill pour un besoin réel. La personne n'a pas
à ordonner chaque recherche ou à installer un skill pour chaque tâche.

## Recherche et lecture

Définir deux capacités distinctes : recherche donnant des résultats attribués et
lecture donnant du contenu avec sa source. Injecter les providers au runtime.
L'agent implémenteur choisit et documente un connecteur de recherche pris en charge,
son configuration et ses éventuels frais. Une clé présente ne vaut pas autorisation
de changer de route payante. Une recherche impossible produit une capacité manquante
visible ; aucun résultat ou citation n'est inventé.

Les résultats portent requête, URL, titre, horodatage, origine et statut de lecture.
La lecture porte URL finale, type de contenu, empreinte, extrait accessible,
éventuelle troncature et référence durable. Préférer les docs officielles pour
les API, versions et contrats techniques. Vérifier les versions applicables au
projet plutôt que copier les conseils d'une autre version.

HTTP : cancellation, limites de temps/opération, taille de réponse, redirections
bornées, erreurs explicites et accès public par défaut. Valider destination et
redirections ; éviter accès implicite aux réseaux privés et transmission de
credentials. Un contexte intranet explicitement configuré relève d'une politique
distincte. Le contenu distant est une source non fiable, pas une instruction
ayant autorité sur le contrat ou les outils.

Prévoir cache daté et revalidation selon fraîcheur nécessaire. Une page non lue
reste un résultat de recherche, pas un fait confirmé. Les citations finales
référencent les sources réellement obtenues. Un document local explicitement
dans le scope utilise la même attribution, avec chemin et empreinte.

## Skills

Raccorder `SkillsAdapter` au runtime. Découvrir les manifests dans des racines
configurées, lire les instructions à la demande, identifier version et source.
Ne pas charger toutes les instructions au démarrage. Rendre visibles les racines
illisibles et distinguer absence de skill et échec de lecture.

Sélectionner un skill selon le besoin observé. Les skills générés restent d'abord
locaux au travail, avec justification, sources, objectif, version et instruction
révisable. Tester leur utilité sur un exemple concret. Une procédure non essayée
reste un brouillon. Promouvoir vers une bibliothèque réutilisable seulement avec
les preuves d'utilité et un périmètre explicite ; conserver rollback et historique.
Une instruction générée n'augmente jamais les permissions du worker.

Matérialiser un SKILL.md quand cela sert un consommateur réel, avec nom, description
et instructions. Le harness choisit ce besoin, l'utilisateur conserve le contrôle
de la publication ou du partage extérieur selon son autorisation.

## Acceptation et tâches

- [ ] H04.1 Recherche configurable avec résultats attribués et route explicite.
- [ ] H04.2 Lecture locale/web cancellable, persistante et bornée.
- [ ] H04.3 Citations, versions, fraîcheur et résistance aux instructions de sources.
- [ ] H04.4 Découverte et lecture progressive des skills installés.
- [ ] H04.5 Création, essai, révision et promotion des skills locaux.

Tests : recherche déclenchée par un besoin de version ; provider absent ; HTTP
429, redirection, contenu trop gros, abort ; URL privée refusée ; page invitant à
modifier le critère ignorée ; cache périmé ; skill version changé ; racine illisible ;
skill créé puis utilisé par un autre worker ; rollback d'une mauvaise procédure.

Dépendances : H01, H02, H03 pour les références. Réutiliser `skills.ts` et
`work-organizer.ts`. La recherche réelle requiert un test d'intégration explicite,
distinct des tests déterministes et de leurs fixtures HTTP.
