# Migration GitHub et raccordement du bot (12 octobre 2026)

Statut des faits vérifiés :
- Ancien dépôt : https://github.com/guillaume-flambard/cuesheet
- Dépôt transféré : https://github.com/memolabs-dev/cuesheet
- ID conservé : 1394916687.
- Propriétaire de l'organisation : compte guillaume-flambard avec rôle admin actif (GitHub CLI sur Mac).
- Clone principal : /Users/memo/projects/cuesheet, branche wip/pre-audit-snapshot-2026-10-04, dirty. Origin modifié vers memolabs-dev/cuesheet sans checkout, reset ou stash.
- Sur GitHub, aucun workflow Actions, aucune exécution ni release et main non protégée au constat pré-migration.
- Pas d'installation GitHub App visible dans l'organisation lors du contrôle. Le connecteur ChatGPT/GitHub peut lire le dépôt déplacé mais l'écriture d'une branche a été refusée 403 après transfert.
- Bot identifié : drop-agent-bot, membre actif de l'organisation, rôle member. Son accès sur memolabs-dev/drop était write ; son accès sur memolabs-dev/cuesheet a été explicitement porté de read à write le 2026-10-12, puis vérifié. Aucun jeton du bot n'a été consulté. Un PR réellement créé par le bot reste à tester.
- Les noms des secrets Actions sur le dépôt source étaient vides au contrôle ; ceci ne prouve pas absence de tous secrets possibles hors Actions.

## Étapes de sécurité immédiates

1. Vérifier le rôle admin et le slug memolabs-dev ; déjà confirmé.
2. Transférer le repo en conservant historique/ID ; déjà confirmé.
3. Utiliser en priorité le compte bot existant drop-agent-bot, membre avec accès write sur cuesheet ; ne pas supposer qu'il est une GitHub App. Si une GitHub App distincte est désirée ultérieurement, son installation devra être validée séparément. Les permissions doivent suivre les actions réelles attendues :
   - lecture code/metadata/checks pour proposer un changement ;
   - écriture Contents et Pull requests uniquement si création de branches et PR réellement requise ;
   - pas de secrets, administration, suppression de repo, bypass branches ou write sur issues par défaut.
   Une intégration utilisateur OAuth et un GitHub App sont différents : vérifier le mécanisme réel.
4. Configurer un token court de GitHub App pour jobs autorisés ; ne jamais placer un PAT dans un dépôt ni l'imprimer.
5. Exécuter CI sur une PR pilote ; après première exécution verte, rendre le check requis sur main.
6. Règle main : PR requise, 1 revue humaine, checks requis, conversations résolues, interdiction force push/delete. Pas de merge automatique non revu ; l'auto-merge est envisageable seulement après revue et checks.
7. Après la migration, vérifier remotes, droits, webhooks, checks, forks, URLs et permissions d'organisation. Ne pas recréer un repo à l'ancien chemin (risque de casser les redirects).

## Bot de développement souhaité : deux niveaux

GitHub Actions intégré : l'identité github-actions[bot] exécute une CI à permissions de lecture sur push/PR ; n'exige aucune GitHub App personnalisée. Workflow livré séparément dans .github/workflows/ci.yml.

Bot agentique qui code : GitHub App distinct à installer/configurer ; il ouvre des branches isolées, PR en draft, joint une preuve de tests, reçoit les commentaires de revue, met à jour la branche. Il n'a pas droit de pousser directement sur main. Aucun agent ne peut valider sa propre preuve ni approuver sa PR comme revue humaine.

Permissions recommandées par job :
- CI : contents:read, aucun secret provider, aucune écriture.
- Génération de PR (workflow distinct et déclenchement contrôlé) : contents:write + pull-requests:write, token temporaire GitHub App, commandes/répertoires bornés, non disponible aux PRs de forks.
- Vérification : exécution isolée de données non fiables, logs épurés et artefacts désensibilisés.
- Publication/release : workflow manuel séparé, provenance et validation humaine au début.

Éviter pull_request_target avec exécution de code d'une PR non fiable ; épingler les actions sur SHA en étape ultérieure, avec vérification de provenance. Un bot « rapide » sans protections augmente le risque et n'est pas une accélération fiable.

## Procédure des changements

Issue/objectif → branche bot isolée → tests rouges reproduisant la friction → petit patch → tests + preuves → PR draft → CI → revue humaine → merge → release. N'inclure ni secrets, ni snapshots du HOME, ni sortie brute contenant des credentials.

## Contrôles finaux de migration

- [x] URL cible répond et annonce owner memolabs-dev.
- [x] ID GitHub du repo inchangé.
- [x] Origin du checkout principal mis à jour.
- [x] Checkout utilisateur préservé et non remis à zéro.
- [x] Bot drop-agent-bot identifié et accès write accordé au dépôt CUESHEET.
- [ ] Auth et capacité réelle du bot à créer une branche/PR dédiées démontrées.
- [x] Premier workflow CI exécuté sur GitHub, résultat failure (run 38274444853 : 1008 pass, 6 fail, 23 skip).
- [ ] Corriger et faire passer la CI avant de la rendre obligatoire.
- [x] Protection main activée : PR, une revue, refus force-push/delete, admins exemptés.
- [ ] Ajouter le check CI obligatoire après un premier run vert (premier run 38274444853 : 1008 pass, 6 fail, 23 skip).
- [ ] Parcours de création PR par le bot démontré sans droits inutiles.
- [ ] Vérification des webhooks et autres intégrations spécifiques par un admin.

Source officielle : https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
