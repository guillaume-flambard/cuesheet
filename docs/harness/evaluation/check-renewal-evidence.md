# EV-CHECK-RENEWAL — PASS de tranche, 2026-10-01

Base : a74d97e. Tranche H01.3, parent encore incomplet.

Reproduction pendant implémentation : le test système correction + confirm_check + reprise observait check.boundRevision 30 au lieu de 14. Le receipt utilisateur de contrôle était traité comme une intention en attente, ce qui créait un objectif. Fix : exclusion explicite des receipts confirm_check dans resume.

23 tests objectifs/mémoire partagée/sessions PASS (/tmp/cuesheet-check-renew-system.log). 28 tests ciblés avec critères réels et typing PASS avant ajout de la reprise complète. Pas de nouveau diagnostic à cette étape ; baseline globale conservée. Suite finale : 739 tests, 737 PASS, 0 fail, 2 skipped, 116.9 s (/tmp/cuesheet-check-renew-all.log). Le garde différentiel fait partie de cette suite. Diff --check PASS. Revue solo orientée mutation/provenance et clôture obsolète ; aucun verifier séparé revendiqué.

Preuves de scénario : mauvais digest refusé sans append ; base périmée et source directive refusées ; human receipt exact renouvelle le même ID ; anciennes preuves refusées ; confirmation pendant un check réel interdit toute certification rétroactive ; reprise explicite du même goal génère une preuve à la nouvelle révision, puis le binding survit au reload. La confirmation seule n’exécute aucun effet.

Limites : seule réautorisation du check déjà épinglé, pas sélection d’un nouveau check ni validation de critères documentaires. Commande manuelle de contrôle disponible ; ergonomie palette encore à livrer. H01.3 reste IN_PROGRESS, R01 partiellement mitigé.
