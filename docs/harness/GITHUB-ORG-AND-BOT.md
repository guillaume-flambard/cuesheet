# Migration GitHub et raccordement du bot (12 octobre 2026)

Statut des faits vérifiés :
- Ancien dépôt : https://github.com/guillaume-flambard/cuesheet
- Dépôt transféré : https://github.com/memolabs-dev/cuesheet
- ID conservé : 1394916687.
- Propriétaire de l'organisation : compte guillaume-flambard avec rôle admin actif (GitHub CLI sur Mac).
- Clone principal : /Users/memo/projects/cuesheet, branche wip/pre-audit-snapshot-2026-10-04, dirty. Origin modifié vers memolabs-dev/cuesheet sans checkout, reset ou stash.
- Sur GitHub, aucun workflow Actions, aucune exécution ni release et main non protégée au constat pré-migration.
- Pas d'installation GitHub App visible dans l'organisation lors du contrôle. Le connecteur ChatGPT/GitHub peut lire le dépôt déplacé mais l'écriture d'une branche a été refusée 403 après transfert.
- Bot identifié : drop-agent-bot, membre actif de l'organisation, rôle member. Son accès sur memolabs-dev/drop était write ; son accès sur memolabs-dev/cuesheet a été explicitement porté de read à write le 2026-10-12, puis vérifié. Les credentials du bot ont été utilisés via GitHub CLI sans afficher le secret ; PR #7 et #10 sont bien créées sous son compte.
- Les noms des secrets Actions sur le dépôt source étaient vides au contrôle ; ceci ne prouve pas absence de tous secrets possibles hors Actions.

## Étapes de sécurité immédiates

1. Vérifier le rôle admin et le slug memolabs-dev ; déjà confirmé.
2. Transférer le repo en conservant historique/ID ; déjà confirmé.
3. Utiliser en priorité le compte bot existant drop-agent-bot, membre avec accès write sur cuesheet ; ne pas supposer qu'il est une GitHub App. Si une GitHub App distincte est désirée ultérieurement, son installation devra être validée séparément. Les permissions doivent suivre les actions réelles attendues :
   - lecture code/metadata/checks pour proposer un changement ;
   - écriture Contents et Pull requests uniquement si création de branches et PR réellement requise ;
   - pas de secrets, administration, suppression de repo, bypass branches ou write sur issues par défaut.
   Une intégration utilisateur OAuth et un GitHub App sont différents : vérifier le mécanisme réel.
4. Une GitHub App à token court reste une amélioration de sécurité future ; l'agent utilise aujourd'hui un compte technique avec secret en trousseau local. Ne jamais placer un PAT dans un dépôt ni l'imprimer.
5. Exécuter CI sur une PR pilote ; après première exécution verte, rendre le check requis sur main.
6. Mise à jour du 12 octobre : mode solo assumé par le propriétaire, PR toujours requise, 0 approbation obligatoire, check strict Core and integration tests requis, conversations résolues, admins inclus, interdiction force-push/delete. Auto-merge permis par GitHub. Retour au quorum de revue recommandé à l'arrivée de contributeurs.
7. Après la migration, vérifier remotes, droits, webhooks, checks, forks, URLs et permissions d'organisation. Ne pas recréer un repo à l'ancien chemin (risque de casser les redirects).

## Bot de développement souhaité : deux niveaux

GitHub Actions intégré : l'identité github-actions[bot] exécute une CI à permissions de lecture sur push/PR ; n'exige aucune GitHub App personnalisée. Workflow livré séparément dans .github/workflows/ci.yml.

Bot agentique qui code : le compte GitHub existant drop-agent-bot est authentifié séparément dans le trousseau GitHub CLI. Il dispose de write sur CUESHEET et Drop. Le 12 octobre, il a effectivement poussé la branche fix/ci-pnpm-build-20261012 et ouvert la PR draft #7 (https://github.com/memolabs-dev/cuesheet/pull/7) comme auteur. Ce test valide auth, push, commit et PR, mais PAS encore réponse aux revues/merge. Une GitHub App avec tokens à durée courte et permissions fines pourra remplacer plus tard ce compte technique après audit, sans accès admin par défaut. Aucun agent ne peut valider sa propre preuve ni approuver sa PR comme revue humaine.

Permissions recommandées par job :
- CI : contents:read, aucun secret provider, aucune écriture.
- Génération de PR (workflow distinct et déclenchement contrôlé) : contents:write + pull-requests:write, token temporaire GitHub App, commandes/répertoires bornés, non disponible aux PRs de forks.
- Vérification : exécution isolée de données non fiables, logs épurés et artefacts désensibilisés.
- Publication/release : workflow manuel séparé, provenance et validation humaine au début.

Éviter pull_request_target avec exécution de code d'une PR non fiable ; épingler les actions sur SHA en étape ultérieure, avec vérification de provenance. Le workflow de confiance auto-merge (pull_request_target) ne checkout et n'exécute JAMAIS le code d'une PR : il ne fait qu'armer l'option native GitHub, et le merge reste bloqué tant que la CI stricte n'est pas verte. Un bot « rapide » sans ces protections augmente le risque.

## Procédure des changements

Issue/objectif → branche bot isolée → tests rouges reproduisant la friction → petit patch → tests + preuves → PR prête → CI obligatoire → auto-merge natif → CI sur main. Mettre le label hold-merge (ou laisser en draft) pour demander une revue avant intégration ; ce workflow n'autorise ni release automatique ni exception à la CI. N'inclure ni secrets, ni snapshots du HOME, ni sortie brute contenant des credentials.

## Contrôles finaux de migration

- [x] URL cible répond et annonce owner memolabs-dev.
- [x] ID GitHub du repo inchangé.
- [x] Origin du checkout principal mis à jour.
- [x] Checkout utilisateur préservé et non remis à zéro.
- [x] Bot drop-agent-bot identifié et accès write accordé au dépôt CUESHEET.
- [x] Auth propre au bot, push sous drop-agent-bot, branche et PR draft #7 démontrés (commits 830dac0, 0ad0093, 0409124).
- [x] Premier workflow CI exécuté sur GitHub, résultat failure (run 38274444853 : 1008 pass, 6 fail, 23 skip).
- [x] CI corrigée, PR #7 fusionnée automatiquement sur main le 12 octobre (16b3dc8).
- [x] Protection main actualisée pour solo : PR et CI strictes obligatoires, 0 approbation, admins soumis, force-push/delete interdits, conversations résolues.
- [x] Check « Core and integration tests » obligatoire sur main avant fusion ; PR #7, #10 et #11 fusionnées via auto-merge avec CI verte sur leurs heads.
- [x] Parcours authentification → commit/push → PR par bot démontré sans nouveaux droits admin.
- [x] Commentaire autonome du bot sur sa PR : https://github.com/memolabs-dev/cuesheet/pull/7#issuecomment-6128534827 .
- [ ] Revue humaine facultative en solo, à réactiver comme règle de branche avant d'accueillir une équipe ; aucun faux auto-approve.
- [x] Scénario PTY Mac corrigé dans PR #11 (outil local explicite limité à fixture temporaire), tests ciblés 2/2 ; la suite Mac complète concurrente reste en investigation.
- [ ] Vérification des webhooks et autres intégrations spécifiques par un admin.

Source officielle : https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository

## Nom du bot partagé — décision proposée, non appliquée

Le compte actuel drop-agent-bot n'est plus correctement nommé pour plusieurs produits. Recommandation de marque : « Memolabs Agent » ; candidat de login neutre : memolabs-agent (ou memolabs-devbot). Le bot est un outil de l'organisation, pas une composante de Drop ni de CUESHEET. Aucun changement d'identifiant GitHub n'a été exécuté sans revue des dépendances.

Inventaire préalable obligatoire : contributions/PR ouvertes sur memolabs-dev/drop, mentions d'issue/review, CODEOWNERS, remotes, scripts, trousseau GH CLI, CLI/API/VPS, webhooks, applications GitHub, tokens/autorisations, commits noreply et provenance de signature. Après changement de login, vérifier chaque branche/PR et la configuration locale du compte bot, puis documenter les redirections et corriger les liens. Ne pas supposer que les @mentions, URLs de profil ou CODEOWNERS anciens sont redirigés : GitHub documente ces limites dans https://docs.github.com/en/account-and-profile/concepts/username-changes et https://docs.github.com/en/account-and-profile/reference/username-reference .

Ne jamais renommer le compte par une opération de création d'un nouveau utilisateur ni supprimer l'ancien pour « nettoyer ». Un simple libellé d'affichage peut être renommé indépendamment du handle si nécessaire pour ne pas interrompre le service. Choix définitif du login à confirmer au moment de l'opération.


## Politique de fusion automatisée du mode solo (2026-10-12)

- Dépôt : allow_auto_merge=true ; delete_branch_on_merge=true.
- Branch main : required_status_checks Core and integration tests, strict=true, required_approving_review_count=0, enforce_admins=true, required_conversation_resolution=true, pas de force push/delete.
- `.github/workflows/auto-merge.yml` : sur opened/reopened/ready_for_review/synchronize/unlabeled, arme l'auto-merge pour une PR **non draft**, dont le dépôt source est exactement memolabs-dev/cuesheet et l'auteur est **guillaume-flambard** ou **memo-labs-automation[bot]** (GitHub App). L'ancien compte drop-agent-bot a été retiré de ce filtre le 2026-10-14 : bloqué par l'exigence de 2FA sécurisée de l'organisation, remplacé par la GitHub App. Aucun checkout ni exécution du code PR. `GH_TOKEN` est celui du workflow, permissions limitées à contents/pull-requests write.
- Label `hold-merge` ou conversion en draft : déclenche maintenant un workflow qui désarme aussi l'auto-merge **déjà activé** ; le retrait du label et le passage à « ready » le réarment. Une action après que la CI est devenue verte peut arriver trop tard si GitHub a déjà fusionné : pour une revue obligatoire, ouvrir la PR en draft ou ajouter `hold-merge` dès sa création.
- L'auto-merge natif respecte les checks et la politique de branche ; le workflow ne donne pas de bypass, n'approuve pas en usurpant une identité et n'accorde pas de droits supplémentaires au compte bot.
- Risque accepté explicitement : les commits du bot peuvent être fusionnés sans inspection humaine si les tests ne détectent pas une régression. Réactiver une revue obligatoire, les CODEOWNERS et une GitHub App à permissions fines au passage à plusieurs développeurs.
- Les PR créées par un workflow avec son `GITHUB_TOKEN` peuvent ne pas déclencher les workflows suivants : pour le chemin automatisé, utiliser un compte bot/App séparé (comme drop-agent-bot) et vérifier par PR de bout en bout.
- Portée : ce workflow vit dans CUESHEET seulement. Il n'est PAS automatiquement installé dans DROP ou d'autres dépôts.
