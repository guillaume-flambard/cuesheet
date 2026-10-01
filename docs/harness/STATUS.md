# Journal d'exécution du dossier

## Passation, 2026-10-01

- Référence du code examinée : `f4f05bf`.
- Cette passation ajoute uniquement des specs, TODO et instructions d'exécution.
- Aucun lot restant de TODO n'est déclaré implémenté par ces documents.
- Dernière validation du code, historique : 674 tests, 672 passants, 2 ignorés ;
  garde TypeScript différentiel sans nouveau diagnostic.
- Fichier étranger préservé : `docs/SURFACE-DOGFOOD-2.md`, non suivi à la référence.

## Gabarit à remplir par lot

## Exécution ici : baseline et contrat d'objectifs, 2026-10-01

Référence de départ : `be2bc55`. État initial : modification locale de
`src/adapters/work-organizer.ts` et fichier utilisateur non suivi
`docs/SURFACE-DOGFOOD-2.md`. Le propriétaire a confié le choix du traitement de
la modification locale ; les garanties de conservation du plan et de provenance
des skills sont rétablies dans le chantier, sans toucher au fichier utilisateur.

Baseline réellement exécutée : 674 tests, 671 passent, 1 échoue, 2 ignorés.
Le défaut reproduit est la perte de la spec lors d'un changement de phase dans
`test/work-organizer.test.ts`. Log local : `/tmp/cuesheet-harness-baseline.log`.
Le scénario de contexte long confirme la duplication historique/snapshot ; les
octets mesurés sont 1 297 785 pour l'historique, 1 107 338 pour le snapshot et
2 585 326 pour le frame complet. Mesure UTF-8, pas une estimation de tokens.

Manifeste initial : `evaluation/manifest.json`. Il référence des fixtures déjà
présentes, distingue leurs niveaux de preuve et garde ouverts les essais réels.
Il ne déclare ni benchmark confirmatoire ni supériorité sur OpenCode.

Implémentation en cours : objectifs applicatifs versionnés avec IDs indépendants
du texte ; correction humaine préservant l'ID ; plans liés à la révision ; sources
et provenance des interprétations ; checks épinglés liés au contrat et preuves
référencées par objectif/révision ; validation des records à la lecture et avant
écriture durable ; replay conservateur des goals historiques.

Limite explicite : une correction ou description après épinglage invalide
l'autorité de fermeture du contrat précédent. Le contrôle peut encore vérifier
son ancien périmètre, mais ne clôt pas le contrat changé. Le renouvellement d'un
critère explicitement autorisé, les sous-objectifs et l'extraction complète restent
à raccorder avant de cocher l'ensemble de H01.

Validation de cette tranche : suite complète 678 tests, 676 passants, 2 ignorés,
aucun échec (`/tmp/cuesheet-objectives-all.log`). Une régression supplémentaire de
reload/version corrompue a ensuite été ajoutée ; les cinq tests d'objectifs passent.
Garde différentiel sans nouveau diagnostic. Le compilateur terminal garde les
quatre diagnostics hérités dans les sources partagées ; aucune erreur terminal
nouvelle. `git diff --check` passe ; aucun changement dans `src/core`.

Revue : la description proposée par le modèle conserve le texte d'intention
original et possède une provenance distincte ; les cycles transitifs sont refusés
sans écriture ; le replay d'une version inconnue refuse sans toucher aux octets.
Les anciens objectifs reçoivent des IDs de séquence en lecture, auteur inconnu et
aucun nouveau check. Interruption et reprise conservent leur état applicatif.

H01 reste partiel : extraction et contrats éditables complets, renouvellement
autorisé des critères et sous-objectifs demeurent ouverts. Aucune case H01 n'est
cochée prématurément. Le lot 0 est achevé et son manifeste reste initial.

## Contexte borné et récupération, 2026-10-01

Référence de départ : `b711f6e`. Détails : CONTEXT-IMPLEMENTATION.md. Frame du
scénario 10 000 observations : 13 728 octets contre 2 585 326 à la baseline,
dont 4 162 d'historique et 8 189 de snapshot. Même contenu source conservé dans
le journal. Aucune inférence ni coût provider mesuré dans cette comparaison.

Les plafonds sont injectables ; le launcher transmet CUESHEET_CONTEXT_CHARS.
Les observations historiques peuvent être omises, les directives/mémoires humaines
actives restent prioritaires. La récupération lit pages et fragments sans mutation.
La compilation réduit les tableaux par blocs pour éviter un coût quadratique.

Validation réelle de cette tranche : 682 tests, 680 passants, 2 ignorés, aucun
échec (`/tmp/cuesheet-bounded-all.log`) ; garde différentiel sans nouveauté.
Régressions : contrainte humaine ancienne, frame borné, intégrité des sources,
recomposition de longs records et refus d'autorité trop volumineuse. H03 reste
partiel : tokenizers, extraction idempotente complète, contradictions et isolation
multi-projet restent ouverts. Aucun changement core.

### Lot / date / commit

- Référence de départ et état Git :
- IDs de tâches traités :
- Comportement réellement livré :
- Décisions et écarts de conception justifiés :
- Régressions avant/après :
- Tests et commandes, résultats et tests ignorés :
- Intégrations réelles / fixtures / essais avec modèles réels :
- Preuves et artefacts de mesure :
- Revue et risques encore ouverts :
- Cases du backlog mises à jour :
- Commit local :
- Travail suivant et dépendances manquantes :

Checklist du lot :

- [ ] Régression pertinente.
- [ ] Diagnostics vérifiés.
- [ ] Tests ciblés et suite complète.
- [ ] Revue.
- [ ] Specs, TODO et preuves actualisées.
- [ ] Commit ciblé.

## Recherche et skills — exécution en cours

Lecture publique Node réelle : HTTP 200, 27 984 caractères capturés et empreinte durable. Suite initiale : 690 tests, 688 réussis, zéro échec, deux ignorés. Intégration producer : skill installé + document lu atteignent la prochaine inférence, écriture réelle, clôture par check indépendant. Correction H07.2a reproduite avant changement : nom de capacité undefined ; test exact passe après correction. 24 tests ciblés passent. H04 reste incomplet : cache, versions/citations, recherche Brave réelle et promotion restent à vérifier/implémenter.

Cache H04.3 : fenêtre explicite (fresh par défaut), date/hash vérifiés, aucune nouvelle preuve sur hit, révision liée et échec de refresh sans contenu présenté comme actuel. Lecture locale H04.2 : racine projet, realpath, texte UTF-8 régulier borné, exclusions usuelles, capture attribuée. 18 tests ciblés passent. Dernière suite avant lecteur local : 693 tests / 691 pass / 0 fail / 2 skipped.

Continuité H05.2/H05.3 partielle : quatre tranches maximum par défaut, steps modèle monotones, notes datées dans le journal avec executionId, coût inconnu, limite et stagnation distinctes. 29 tests ciblés passent, dont tâche réelle en dix inférences + check indépendant, annulation frontière, répétition et assertions humaines en cours. Configuration CUESHEET_MAX_SLICES (1–16). Dernière suite complète intermédiaire a deux échecs corrigés (assertion structurelle ancienne et launcher). Nouvelle suite complète en cours ; aucun statut READY revendiqué.

Preuve finale de tranche EV-COMBINED-698 : 698 tests, 696 réussis, aucun échec, deux ignorés (dont MB-01 live installé explicitement exclu). /tmp/cuesheet-execution-final.log. Guard typage différentiel vert ; build global conserve diagnostics hérités. Projet IMPLEMENTING, 35 P0/15 P1 encore ouverts, 50 AC pending.
