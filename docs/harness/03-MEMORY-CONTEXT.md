# H03 : mémoire automatique et contexte reconstruit

## Résultat

Les agents reprennent une feature sans relire toute sa conversation. Ils disposent
des objectifs, décisions, contraintes, preuves, erreurs connues et questions
pertinentes. Le journal complet reste la source de vérité.

## Mémoire

Entretenir automatiquement les décisions, contraintes, questions, réponses,
hypothèses et leçons lorsque les échanges ou observations changent le travail.
Conserver les identifiants, auteur, rôle, objectif, révision, justification,
sources, statut et lien de remplacement. Distinguer parole utilisateur,
interprétation modèle, résultat d'outil et vérification.

Le modèle peut proposer une correction de sa mémoire ; une correction humaine
prend autorité sur ce record. Une contradiction devient visible et conserve les
deux versions et leurs sources. Une hypothèse réfutée conserve la croyance initiale,
le contre-exemple et la conclusion actuelle. Une extraction ne doit pas inventer
une autorisation à partir d'une ancienne conversation.

Après crash, une extraction déjà enregistrée ne se duplique pas. Définir une clé
de traitement ou un watermark permettant de distinguer échanges non traités et
records déjà produits. Garder les corrections accessibles même si l'extracteur
échoue ; l'extraction secondaire ne doit pas retarder leur admission.

## Contexte

Compiler un contexte borné selon les capacités du modèle : contrat courant,
instructions humaines pertinentes, décisions actives, questions bloquantes,
preuves et observations utiles, capacités disponibles, actions incertaines et
prochaine étape. Définir une estimation des tokens et sa marge ; exposer le budget
estimé et les éléments omis. Ne pas dupliquer systématiquement historique complet
et snapshot comme actuellement.

Chaque élément condensé conserve des références récupérables vers ses sources.
Ajouter une lecture par IDs, plages de séquences ou artefacts. Les résumés sont
des projections avec base de révision ; ils ne deviennent pas des preuves. Les
objectifs et contraintes humaines prioritaires restent dans le contexte utile.
Une absence dans le contexte signifie « omis » et pas « absent du journal ».

Reconstruire après changement de provider, correction, approche de la fenêtre de
contexte, redémarrage ou remplacement d'agent. La reconstruction n'ajoute aucun
fait par elle-même. Séparer mémoire de session, de projet et personnelle ; seuls
les périmètres explicitement raccordés peuvent alimenter le travail. Prévoir export
et correction sans mélanger les projets ni importer de secrets.

## Acceptation et tâches

- [ ] H03.1 Extraction automatique sourcée, idempotente et reliée aux objectifs.
- [ ] H03.2 Contradictions, réponses, supersession et leçons sans effacement.
- [ ] H03.3 Compilateur borné et récupération ciblée des sources omises.
- [ ] H03.4 Reconstruction et isolation des différents périmètres de mémoire.
- [ ] H03.5 Mesure sur un journal long et substitution réelle de modèles.

Tests : 10 000 événements avec contrainte ancienne indispensable ; correction
après compaction ; crash entre échange et extraction ; double extraction ;
résumé mensonger sans effet sur le verdict ; conflit humain/modèle ; source
supprimée ou illisible signalée ; modèle de petite fenêtre recevant un frame
compatible ; deux projets isolés ; mêmes événements donnant même projection.

Mesurer tokens avant/après, coût de compilation, précision des sources et réussite
du scénario de reprise. Fixer les seuils dans H10 après mesure initiale.

Dépendance : H01. Réutiliser `work-memory.ts`, `shared-context.ts`, `work-state.ts`
et les fonctions utiles de `core/memory.ts` sans élargir le core par anticipation.
