# EV-LOCAL-VAULT-CONTAINERS — PASS_PARTIAL

2026-10-01, Node24.21.0/macOS, Docker Desktop local Engine29.8.1/Linux/API1.56. Image officielle locale déjà disponible : node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6. Aucun VPS, push, publication ou déploiement. Docker global reste démarré ; seuls noms UUID propres des appels sont supprimés.

## Commandes et résultats

`rtk proxy env CUESHEET_TEST_TOOL_SOCKET=/Users/memo/.docker/run/docker.sock CUESHEET_TEST_TOOL_IMAGE=node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 rtk node --test --test-skip-pattern='MB-01 a real run against the installed binary' --test-reporter=spec 'test/**/*.test.ts'` :780 tests,778 pass,0 fail,2 skips explicites,42.3s ; full-tests.log.

49 tests ciblés pass, sans skip : API Unix fake/policy/mux/corruption/CAS/permissions + Docker réel/node lecture-écriture/réseau/descendant/callback sous journal runtime + Vault pendant inference. targeted-tests.log précède la stricte comparaison boolean du grant, ensuite régressée dans full-tests.log.

`rtk proxy bash scripts/build.sh` : PASS build/pkg/bundle/asset37 notices ;32 diagnostics TypeScript hérités conservés. Test surface-v2 vérifie le différentiel sans nouveau diagnostic. build.log. Ne pas présenter ceci comme tsc global vert.

## Périmètre prouvé

H09.3b : admission commune conservée ; configuration modèle n'élargit pas Engine/image/montages/env/ressources ; version API/platform contrôlée ; readonly contrôle, pas host voisin/réseau ; descendant annulé ne produit pas son fichier retardé ; reçu admis avant création et cleanup sous claim lié à intentSeq ; erreur admission pas de create ni fallback ; create non confirmé + DELETE404 reste incertain. Special files/hardlinks refusés par scan avant montage.

E01.5a : versions/source/historique/tombstones/replay purs, deux processus ne gagnent pas le même CAS ; index textuel non persisté reconstruit identique ; corruption conservée. E01.6a : grants search+read avant IO, recheck à lecture/restitution ; scope refusé corrompu pas ouvert ; ancienne référence refusée après révocation ; roots/scopes copiés contrôleur, aucun grant document. E01.5b1 : retrieval automatique goal/top5 dans frame borné, digest change et révocation pendant inference écartent outil périmé, références sourcées ; runtime réel lit le corpus projet par défaut.

## Revue adversariale solo et limites

La revue a trouvé le faux raisonnement DELETE404 après create sans confirmation ; corrigé/régressé, reçu uncertain conservé. Une fixture runtime a sélectionné un autre dépôt via le registre ambiant : fichier témoin propre retiré, objectif de fixture sans lien registre et garde de scope avant toute commande, montages/checks ambiants neutralisés. Diagnostic Vault TS2345 détecté par différentiel, corrigé sans modifier baseline.

Pas de vérificateur agent indépendant ni preuve de sécurité kernel absolue. TOCTOU sur filesystem partagé, quotas disque, restauration des ressources après crash, capacités git/rg/cargo dans image, sélection automatique Docker, routes locales non confinées restent ouverts (R06/H09.3c/H06/H07). Pas auth réseau ni grants d'équipe/personnels runtime, sync/import/Obsidian/export ou benchmark retrieval : E01.3/4/5b/6/7 restent ouverts. Vault documents ne duplique pas l'autorité objectifs/checks/mémoire. Aucune supériorité Pi/OpenCode mesurée.

Sources de discovery : https://docs.docker.com/engine/containers/run/ ; https://docs.docker.com/engine/security/ ; https://docs.docker.com/reference/api/engine/version/v1.51/ ; https://developer.apple.com/forums/thread/661939 . Seatbelt non retenu comme fondation produit.
