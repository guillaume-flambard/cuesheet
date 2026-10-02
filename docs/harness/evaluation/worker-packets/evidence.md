# EV-WORKER-PACKETS — H06.2a

2026-10-02 : validation des paquets uniquement, avant raccordement runtime.

14 tests PASS/0fail : `rtk node --test test/code-worker-packets.test.ts test/agent-consultation.test.ts test/agent-skills.test.ts`, trace `/tmp/cuesheet-worker-packets-targeted.log`. Tests conflits parent/enfant, casse et normalisation Unicode, chemins Windows/POSIX, credentials/cache, bornes, champs autorité et modification tardive de la proposition. Consultations existantes et deux vrais processus fournisseurs restent PASS.

Build final PASS, 32 diagnostics hérités : `/tmp/cuesheet-worker-packets-build.log`. Revue solo adversariale : ajout refus noms Windows réservés et segments espace/point final après recherche de collisions portables ; tests rerun PASS. Aucun src/core modifié.

La dernière suite globale reste celle du commit a806d2e :869/867/0/2. Pas de nouvelle suite globale pour cet adaptateur pur encore non raccordé ; aucune preuve de code workers parallèles, scope effectif ou reprise crash revendiquée. H06.2b/c, H06.4a, H06.3c2 et H06.5c pending. R06 ouvert, état global IMPLEMENTING.
