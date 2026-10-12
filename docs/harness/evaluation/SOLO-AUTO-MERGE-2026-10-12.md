# CUESHEET — mode solo : auto-merge, contrôles et preuve (12 octobre 2026)

## Pourquoi

L'organisation Memolabs Dev est exploitée par un développeur avec le compte technique `drop-agent-bot`. Durant cette période, les approbations d'un second développeur ne sont pas utiles, mais supprimer la CI ou fusionner par `--admin` serait dangereux. GitHub doit fusionner automatiquement **seulement** quand les tests requis passent sur la révision courante.

## Configuration observée

- Dépôt `memolabs-dev/cuesheet` : `allow_auto_merge=true`, `delete_branch_on_merge=true`.
- `main` : `Core and integration tests` obligatoire, `strict=true` (branche synchronisée), protections administrateur activées, approbations obligatoires `0`, conversations résolues, force-push et suppression interdits.
- Bot actuel : `drop-agent-bot`, compte GitHub à part (futur nom neutre envisagé : `memolabs-agent`, aucune opération de renommage).
- Workflow `.github/workflows/auto-merge.yml` : `pull_request_target` **sans checkout, sans exécution de code ou contenu de PR**, restriction aux deux auteurs approuvés et aux branches issues du même dépôt, ne fait qu'armer `gh pr merge --auto --merge`.
- Pause : label `hold-merge` (créé dans le dépôt) ou retour en brouillon. Le workflow désarme l'auto-merge déjà armé avec `gh pr merge --disable-auto`. Retirer le label/rendre prête réactive la fusion. Si les checks sont déjà verts et la fusion a déjà eu lieu, une pause tardive ne peut pas annuler l'historique.
- Jamais de faux auto-approve : GitHub requiert 0 approbation pendant le mode solo. Réactiver des revues vraies quand il y a plusieurs humains.
- Aucune propagation automatique de cette politique dans le dépôt Drop ou d'autres repositories.

## Observations réellement vérifiées

- PR #7 (CI) : fusion sur main après CI verte.
- PR #10 (documentation, rankings, Human UI) : fusion sur main après CI verte.
- PR #11 (refus répétés / PTY Mac) : auto-merge armé, attente de branche à jour et nouvelle CI, puis fusion.
- PR #12 (workflow d'activation automatique) : fusion après CI verte ; il s'agit du bootstrap.
- PR #13 (intent before effect) : le compte bot a créé la PR ; **GitHub Actions a activé auto-merge automatiquement** sur l'événement PR ; la CI a passé et GitHub a fusionné sans commande de merge manuelle.
- PR #14 (replay incertain) : première CI échouée sur 14 scénarios terminal ; **aucune fusion** ; correctif de la frontière core/contrôleur, deuxième CI verte, fusion automatique.
- PR #16 : extension du workflow pour désarmer l'auto-merge si `hold-merge` ou draft, puis réarmer à la reprise ; preuve de CI/merge à collecter au moment de l'intégration.

## Procédure de test « hold » sans toucher à la production

1. Ouvrir avec `drop-agent-bot` une PR same-repo non-draft portant seulement ce document et vérifier que le workflow déclenche `Enable auto-merge` et arme la PR.
2. Appliquer `hold-merge` **avant fin du check CI** et observer le workflow de désarmement puis `autoMergeRequest = null`.
3. Même quand `Core and integration tests` devient vert, la PR doit rester ouverte en pause.
4. Enlever `hold-merge` : un événement `unlabeled` doit réarmer l'auto-merge, puis GitHub fusionne automatiquement.
5. Collecter liens des deux jobs, identité déclenchante, commits et statut final. N'inventer aucune réussite : une capture de configuration n'est pas une validation de ce flux.

## Limites et risques

- Le workflow avec `GITHUB_TOKEN` peut activer l'auto-merge mais **une PR créée par un autre workflow avec `GITHUB_TOKEN` peut ne pas déclencher d'autres workflows** ; le bot utilise son propre compte.
- L'accès en écriture du bot suffit à proposer du code qui peut ensuite être fusionné sans inspection humaine : le test CI ne prouve pas tout, même en mode solo. Le périmètre d'exécution bot et les secrets restent des surfaces d'attaque.
- Si `hold-merge` est ajouté après que GitHub a déjà fusionné une PR verte, la pause ne peut pas inverser la fusion. Pour les travaux sensibles, ouvrir une PR en draft ou appliquer le label immédiatement.
- Le workflow de fusion n'est pas une preuve de réussite du travail de l'agent, il n'accorde pas à un LLM l'autorité de validation. Le journal de CUESHEET distingue produit, observé et vérifié.

Sources GitHub :
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-pull-requests-in-your-repository/automatically-merging-a-pull-request
- https://docs.github.com/en/actions/reference/events-that-trigger-workflows#pull_request_target
- https://docs.github.com/en/rest/branches/branch-protection

Ressources canoniques : `docs/harness/GITHUB-ORG-AND-BOT.md`, `IMPLEMENTATION-GATES-2026-10.md`, issue #8.
