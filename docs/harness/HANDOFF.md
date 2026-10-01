# Passation à l'agent exécutant

Copier le bloc suivant comme message de départ. Aucun autre chat n'a été créé
ou contacté pour cette passation.

```text
Travaille sur Cuesheet dans /Users/memo/projects/tools/cuesheet.

Exécute le dossier docs/harness jusqu'à son accomplissement, par lots vérifiables.
Commence par docs/harness/README.md, TODO.md et la spec du premier lot. Charge les
autres specs quand leur chantier commence. Consulte les règles AGENTS.md applicables
et CONTRIBUTING.md avant de modifier le code. Le propriétaire demande un harness
autonome : une intention et des corrections naturelles suffisent ; le harness
choisit recherche, spec, plan, tâches, skills, construction, revue et délégation.
Les contrôles manuels sont des corrections possibles, jamais le parcours obligatoire.

État de référence : f4f05bf. Des sessions persistantes, providers sélectionnables,
mémoire sourcée et outils internes d'organisation existent déjà. Lis les fichiers
avant de les remplacer. Les tests scriptés ne prouvent pas encore la qualité des
décisions avec un modèle réel. Préserve les checks indépendants et la distinction
entre déclaration, observation et validation.

Au démarrage, relève HEAD et git status, puis établis la baseline réelle dans
docs/harness/STATUS.md. Ne recopie pas les anciens chiffres comme un nouveau résultat.
docs/SURFACE-DOGFOOD-2.md est un fichier utilisateur non suivi à la référence :
préserve-le et ne l'inclus pas dans un commit de ton travail.

Préfixe chaque commande shell par rtk, conformément à /Users/memo/.codex/RTK.md.
Les chemins des documents sont relatifs au repository, sauf les deux chemins
explicites de ce message. Ne dépends pas des chemins personnels dans le produit.

Fais les lots dans l'ordre de TODO, en respectant leurs dépendances. Tu peux ajuster
les détails d'implémentation après inspection ; consigne le pourquoi et les preuves.
Ne supprime pas une exigence produit pour faciliter l'implémentation. Pour une
capacité externe indisponible, termine les travaux indépendants, consigne précisément
la configuration manquante et laisse la case concernée ouverte. Ni l'absence d'une
clé ni un test ignoré ne valent une intégration réussie.

Garde les nouveaux comportements applicatifs dans les adaptateurs/projections/runtime.
Une modification de src/core doit respecter l'admission de CONTRIBUTING : problème
observé, reproduction, invariant nécessaire. Une préférence produit ne justifie pas
un nouveau core abstrait. Réutilise stores, receipts, captures et workers existants.

Pour chaque lot : régression utile, implémentation, tests ciblés, garde TypeScript
différentiel, suite complète d'intégration, revue, documentation, commit local ciblé.
Le repository a des diagnostics TypeScript préexistants ; n'élargis pas la baseline
pour cacher une nouveauté. Ne prétends pas à un build global propre sans le mesurer.

Commandes de référence utilisées à f4f05bf, à vérifier avec les scripts actuels :
rtk node --test --test-skip-pattern='MB-01 a real run against the installed binary' --test-reporter=spec 'test/**/*.test.ts'
rtk node --test test/typecheck-guard.test.ts
rtk ./node_modules/.bin/tsc -p apps/terminal/tsconfig.json --noEmit
rtk git diff --check

Le skip MB-01 garde le transport réel dans une intégration dédiée ; il ne démontre
pas que ce transport a été revalidé. Identifie et explique tous les tests ignorés.
Les nouveaux essais réseau/provider doivent être explicitement configurés. Consulte
les docs officielles actuelles pour les API et l'auth ; aucune extraction implicite
de secrets depuis une autre application. Ne pousse, publie ou déploie rien sans
autorisation applicable. La passation n'autorise pas à envoyer des messages dans
d'autres chats. Applique les règles de délégation du contexte qui t'est fourni.

Maintiens STATUS.md à chaque commit : ID du lot, comportement livré, tests réels,
simulations, preuves, commit, tâches restantes et blocages précis. Continue vers le
lot suivant sans demander une confirmation routinière. Ne déclare pas le dossier
achevé tant qu'une exigence ou une validation requise reste ouverte.

La réussite finale est le parcours fil rouge de README, avec résultat au contrat
courant, mémoire durable, reprise différée, autre modèle et agent remplacé. Livre
aussi le rapport H10 et les limites observées. L'exigence de résultat doit rester
identique quel que soit le modèle ; son effort et son taux de réussite sont mesurés.
```

## Note pour l'exécution

Les notes historiques `AUTONOMOUS-WORK.md`, `WORK-MEMORY.md`,
`SHARED-CONTEXT-SPEC.md`, `TERMINAL-SESSIONS*.md` et `PROVIDER-UX*.md` décrivent
les briques déjà livrées. Le dossier `harness/` décrit le contrat complet restant.
Les lire pour éviter de confondre un exemple scripté et une capacité produit prouvée.
