# EV-SCOPED-RUNTIME — preuve de tranche, 2026-10-01

Base 7af4fc9 : deux contre-exemples échouaient avant correction (/tmp/cuesheet-scope-before.log), fichier réel écrit dans le répertoire de lancement et options ambiguës relatives. Les factories contrôleur suivent maintenant le projet choisi pour shell, recherche locale et skills par défaut ; racines explicitement configurées conservées.

Tests avec vrais processus/fichiers : écriture et cat seulement dans le projet lié, guide et skills du bon projet, frame cohérente ; choix ambigu absolu, aucun appel modèle avant sélection, cwd extérieur proposé refusé (exit126), écriture relative suivante uniquement dans le projet choisi. Intent porte scopeCwd contrôleur, distinct de input.cwd ; anciens intents restent null.

22 tests ciblés receipts/shared/types PASS puis 43 tests scopes/surface/sessions PASS. Suite générale : 751 tests,749 pass,0 fail,2 skipped,167.3s (/tmp/cuesheet-scope-all.log). Garde différentiel types PASS ; diagnostics globaux hérités restent ouverts. Diff --check PASS.

Review solo : factories ne viennent pas du modèle, refus roots conservés, garde effets incertains conservateur, chemins registre normalisés à la frontière. Aucun sandbox OS créé ; contexte de configuration du binaire provider, reprise entre scopes et consolidation inter-scopes restent à vérifier. H09.3a résolu ; H09.3 et R06 restent ouverts.
