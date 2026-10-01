# EV-INSTALLED-TERMINAL — PASS de tranche, 2026-10-01

Base 98a5027. Reproduction avant patch : CLI compilé surface échoue avec « the slice is missing at .../dist/apps/terminal/src/main.tsx » (/tmp/cuesheet-package-terminal-before.log). Ancien oracle ne lançait pas le terminal.

Build réel PASS, avec les 32 diagnostics TypeScript hérités consignés ; aucun nouveau diagnostic au garde différentiel. Bundle Node ESM ~652 KiB + Yoga WASM ~89 KiB + licences/notices de 37 dépendances. Metafile refuse tout import runtime externe non builtin. React production ; gardes devtools Ink adaptées en mémoire au build (source node_modules non modifiée), adaptation vérifiée ou build refusé.

28 ciblés installation/portabilité/types PASS (/tmp/cuesheet-installed-terminal-final-targeted.log). Full : 748 tests, 746 pass, 0 fail, 2 skipped, 108.7 s (/tmp/cuesheet-installed-terminal-all.log). Diff --check PASS. Le tarball de preuve contient 138 fichiers, ~420 KiB compressés/1.5 MiB décompressés. Aucun executable TS.

Npm pack/install réel dans un HOME/cwd isolé, sans checkout en PATH ou cwd. Assets inclus, CLI/exports exécutables, non-TTY donne diagnostic terminal. Vrai expect PTY : saisie du goal, réponse INSTALLED_TERMINAL_OK du binaire fixture hermétique, arrêt après budget, Ctrl+C, exit 0 et curseur restauré. Le premier driver n’écoulait pas l’output pendant after ; le driver reprend le waitms qui draine le PTY utilisé ailleurs, puis le même paquet/code passe. Aucune requête à un provider réel ni clé n’est transmise.

Runtime vérifié Node 24/macOS. Bundle target Node 22 ; pas une matrice de toutes versions/OS. PTY conditionnellement ignoré si expect absent, passé ici. Export/import/rétention encore ouverts et publication non autorisée/non revendiquée. H09.4a DONE ; H09.4 reste ouvert.

Review solo : bundle/source selection, whitelist/cwd/TTY inchangés, wasm relatif et require ESM, externals, notices, aucun fichier utilisateur inclus. Un nouveau défaut de scopes runtime est enregistré H09.3a ; il est indépendant de l’installation et doit être traité avant clôture globale.
