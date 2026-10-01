# EV-MODEL-USAGE — PASS de tranche, 2026-10-01

Base 524aeed. H07.4a : receipts durables de tentatives et compteurs Anthropic.

14 ciblés Anthropic/ledger/typeguard PASS (/tmp/cuesheet-model-usage-targeted.log), puis 13 ledger/model-switch PASS (/tmp/cuesheet-model-usage-system.log). Full : 747 tests, 745 pass, 0 fail, 2 skipped, 112.5 s (/tmp/cuesheet-model-usage-all.log). Diff --check PASS. La première passe a refusé un constructor parameter property incompatible avec le type stripping Node ; déclaration de champ explicite corrigée, aucun nouveau diagnostic ensuite.

Vrai stockage/relecture/corruption sans rewrite ; read d’un root absent sans création ; fin sans début et doublon refusés ; compteurs exacts BigInt au-delà de MAX_SAFE_INTEGER ; absent/invalide/pending ne devient ni zéro consommé ni coût nul. Le coût reste inconnu (null).

Transports HTTP injectés, aucune API live appelée par ces nouveaux tests : max_tokens refuse les propositions mais conserve l’usage rapporté ; abort conserve une tentative pending ; sink refusé avant dispatch interdit fetch, refus après réponse empêche infer de produire des outils. Binding sélectionne deux modèles et garde le sink et modèle demandé de chaque requête. Le vrai createTerminalRuntime écrit le ledger sous la claim de session et laisse les propositions valides s’afficher : consommation ne déplace pas leur base de révision.

Les receipts ne stockent ni prompt, réponse textuelle, credential ou erreur brute. Le journal de consommation est l’autorité de ce domaine, indépendant de l’autorité de travail. Review solo des frontières admission/abort/model switch/root/privacy. Aucun changement core ni facture estimée.

Couverture : Anthropic natif non streaming uniquement. Autres providers, UI des agrégats, prix/plafonds de dépenses et rétention restent dans les tâches ouvertes H07.4/H06.5/H09.4 ; H07.4 parent non clos. Source primaire des catégories de cache : https://platform.claude.com/docs/en/build-with-claude/prompt-caching .
