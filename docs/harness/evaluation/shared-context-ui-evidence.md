# EV-SHARED-CONTEXT-UI — preuve de tranche,2026-10-01

Contexte partagé depuis palette, 20 records/page avec ID/révision/digest, contenu/rationale et sources session/seq. Seuls projet courant et montages configurés apparaissent ; chaque page relit, digest changé remet à zéro. Vide sans mkdir ; corruption/montage indisponible explicites. Les sources restent des interprétations modèle, pas des permissions ou vérifications.

25 tests ciblés PASS (/tmp/cuesheet-shared-ui-targeted.log) : stores réels, isolation d’autre projet, pagination et corruption, fraîcheur, appel modèle impossible durant consultation. App Ink réel CtrlK/down7/Enter/N/P/scroll/Escape, trois tailles40×14,80×24,120×36 avec resize ; footer visible et rows bornées, journal core et scope inchangés. Premier oracle utilisait overlay:null alors que state.ts définit none : oracle corrigé, même code UI ensuite PASS.

Contrôles sources supprimés uniquement au rendu ; stockage conservé. Offset de lecture reste visible après resize. Review solo du chemin sans mutation et diagnostics. Correction/export/workflows d’équipe et multi-machine/auth non revendiqués ; parent E01.4 reste ouvert.

Suite générale760 tests,758 pass,0 fail,2 skipped (/tmp/cuesheet-shared-ui-all.log). Garde différentiel et diff --check PASS ; types hérités toujours ouverts.
