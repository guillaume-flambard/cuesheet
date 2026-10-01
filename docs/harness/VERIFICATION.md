# Vérification et couverture

## Catégories du Whole Project Protocol

Toutes les catégories ci-dessous sont classées pour le périmètre complet demandé,
pas seulement la tranche réseau. Aucune UNKNOWN n'est cachée comme N/A.

| Catégories | Classement | Couverture requise |
| --- | --- | --- |
| core behavior, API contracts, state transitions | APPLICABLE | H01/H02, cas de refus et critères versionnés |
| UX, loading, empty, error states, accessibility | APPLICABLE | H08, Ink/PTY/focus/contraste et navigation |
| cancellation, retries, state restoration, idempotency | APPLICABLE | H05, réponses tardives, recovery avant retry |
| persistence, integrity, migration, compatibility, user migration | APPLICABLE | H01/H09, anciens journaux et corruption |
| concurrency | APPLICABLE | H06, vrais processus, révisions et artefacts isolés |
| authentication, authorization, privacy, security | APPLICABLE | H04/H07/H09, sources non fiables et secrets |
| networking, offline behavior, caching, external integrations | APPLICABLE | H04/H07, absence de route/clé et cache daté |
| performance, metrics | APPLICABLE | H03/H10, taille de frame, coût connu/inconnu, latence |
| logging, diagnostics, testability, developer experience | APPLICABLE | H09/H10, traces interprétables et tests injectés |
| unit, integration, system, E2E, runtime, manual | APPLICABLE | strates distinctes, fixtures et essais réels explicitement identifiés |
| static checks | APPLICABLE | garde différentiel sans nouvelles erreurs ; baseline héritée déclarée |
| build, packaging, local deployment, rollback | APPLICABLE | H09.4, build/pack, HOME temporaire, rollback de données/config |
| remote server deployment | NOT APPLICABLE | aucun déploiement serveur demandé ou autorisé |
| documentation, cleanup of obsolete behavior | APPLICABLE | specs/état/backlog actualisés, pas de plans divergents |

## Gate de vérification par tâche

Lire l'AC de state.json et la spec ; écrire une régression qui échoue avant la
correction ; implémenter ; tests ciblés ; garde différentiel ; intégrations de
la tranche ; suite complète avant commit ; inspection du diff ; registre de
preuves et état. Une intégration réseau/locale réelle ne se remplace pas par un
mock. Une omission de test porte une raison et reste non vérifiée si obligatoire.

Le dernier commit passé n'est pas une preuve pour du code encore modifié depuis.
Les logs `/tmp` sont des traces locales auxiliaires ; inscrire résultats, commit
et scénarios dans STATUS pour qu'ils ne soient pas les seules preuves durables.

## Audit final indépendant du raisonnement d'implémentation

Quand les P0/P1 sont tous DONE, relire specs et AC depuis le contrat, inspecter
les chemins qui contournent les garde-fous et tenter corruption, gros volume,
abort, duplicates, état obsolète, panne provider, manque de clé, permissions,
reload, anciens schémas et navigation adverse. Exécuter le produit packagé et
le parcours fil rouge. Reclasser toute lacune comme TODO avec priorité et AC.
La revue finale n'est pas encore faite et son statut est PENDING.

Un verifier séparé n'est utilisé que si la délégation est autorisée dans le
contexte. À défaut, faire une passe séparée orientée falsification et publier
cette limite d'indépendance. Ce document ne donne aucune autorisation externe.

## Acceptation manuelle finale à produire

Après automatisation verte et zéro P0/P1 ouvert : démarrer une installation neuve,
exprimer une feature sans mode, consulter ses choix, corriger en cours, interrompre,
reprendre avec autre modèle et vérifier le résultat courant. L'objectif du test
humain est l'adéquation de l'expérience, pas la découverte de bugs connus.
Le statut final agent sera READY_FOR_MANUAL_ACCEPTANCE, puis DONE uniquement après
l'acceptation humaine requise. État actuel : IMPLEMENTING, aucune clôture annoncée.

Extension E01 : test/shared-memory.test.ts couvre vrai conflit entre deux processus, isolation de projets, montage entreprise explicite, source corrompue préservée, update externe pendant infer, publication par producer et récupération paginée. 20 tests ciblés avec typing/receipts/slices passent ; suite finale 736/734/0/2 PASS, puis neuf tests partagés PASS dont sélection de projet. Preuve durable : evaluation/shared-context-evidence.md. Réseau multi-machine, permissions équipe et parcours clavier scopes restent PENDING.
