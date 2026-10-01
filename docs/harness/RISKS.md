# Registre de risques

| ID | Risque | Probabilité / impact | Preuve actuelle | Traitement | État |
| --- | --- | --- | --- | --- | --- |
| R01 | Le contrat changé ne peut plus être clôturé avant renouvellement autorisé du check | élevée / HIGH | STATUS, test/objectives.test.ts | H01.3 : binding explicite révisable, preuve à la nouvelle révision | OPEN |
| R02 | Les fixtures ne démontrent pas les bons choix de modèles réels | élevée / HIGH | corpus initial et absence de runs confirmatoires | H02.5 et H10.3/4 | OPEN |
| R03 | Concurrence et remplacement multi-processus terminal non raccordés | élevée / HIGH | seul writer terminal ; temporaryWorker testé séparément | H06.2/3/4 avec isolation et receipts | OPEN |
| R04 | Réseau public, TLS, limites et auth recherche pas encore vérifiés en runtime | moyenne / HIGH | ResearchTools en cours, transports de tests injectés | H04.1/2/3 : runtime réel et cas adverses | OPEN |
| R05 | Plafond de caractères ne négocie pas la fenêtre exacte du provider | moyenne / HIGH | CONTEXT-IMPLEMENTATION, tokens non mesurés | H03.5, H07.2 : capacités et tokenizer/borne adaptée | OPEN |
| R06 | Accès des programmes autorisés dépasse les seules contraintes de cwd | élevée / HIGH | threat-model, ShellToolRunner | H09.3/5 : admission/périmètre, threat model explicite, tests | OPEN |
| R07 | Écriture entre core/vue/artefacts laisse un résultat partiellement présenté | moyenne / HIGH | journaux séparés sans transaction globale | H09.2 : reconciliation/recovery testés | OPEN |
| R08 | Types hérités peuvent masquer un défaut de capacité runtime | moyenne / MEDIUM | loop.ts lit capability.name absent du type stocké | H07.2a : reproduire puis corriger précisément ; pas de fix bulk | OPEN |
| R09 | Journal long conserve des données sensibles dans observations d'outils | moyenne / HIGH | logs/outputs shell et nouvelles sources durables | H09.5 : filtrage et traces/export sans credentials, rétention | OPEN |
| R10 | Migration invente auteur/critère ou perd des décisions anciennes | moyenne / HIGH | schéma applicatif en évolution | H01.5/H09.1 : replay et fixtures de formats anciens | OPEN |

HIGH bloque la clôture du projet, pas les travaux indépendants dont le risque est
déjà isolé. Chaque résolution doit référencer AC et preuve dans state.json/STATUS.
Ces risques ne sont pas déclarés résolus par le seul passage de la suite existante.

R08 : défaut de nom de capacité corrigé avec régression ; risque ciblé résolu par EV-CAPABILITY. Les autres diagnostics hérités restent ouverts.

R11 | Partage d’entreprise entre machines : permissions/auth/offline non livrés | élevée / HIGH | seuls filesystem local et montages explicites vérifiés par EV-SHARED-SCOPES | E01.3/4 : transport choisi, autorisations et scénario équipe | OPEN.

R12 : runner/recherche/skills peuvent conserver le cwd initial après binding d’un autre projet ; élevée/HIGH, OPEN. Inspection de runtime/index/context ; reproduction requise puis H09.3a. Le sandbox OS R06 reste un risque distinct.
