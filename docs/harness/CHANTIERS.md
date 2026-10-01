# Chantiers exécutables

Le backlog TODO.md et les 55 exigences restent canoniques. Ce découpage regroupe leur exécution, sans abandonner de critères ni déclarer une tranche égale à un chantier terminé.

| Chantier | Exigences / TODO | Livraison attendue | Dépendances |
|---|---|---|---|
| C1 Contrats et plans durables | H01, H02.1–2, H09.1 | IDs/révisions, corrections, critères autorisés, tâches dépendantes, compatibilité/replay | B00 |
| C2 Décisions et mémoire automatiques | H02.3–5, H03.1–2 | Processus adapté sans modes imposés, mémoire sourcée, contradictions et adaptation observée | C1 |
| C3 Contexte, recherche et skills | H03.3–5, H04 | Contexte borné récupérable, recherche attribuée, compétences essayées et réutilisées | C1, C2 |
| C4 Continuité et récupération | H05, H09.2–3 | Exécutions distinctes des objectifs, budgets, stop, effets incertains et recovery | C1, C3 |
| C5 Agents et modèles | H06, H07 | Workers isolés sur contrat partagé, remplacements, providers/streaming/routing autorisé | C1, C3, C4 |
| C6 Terminal et validation | H08, H09.4–5, H10 | Parcours clavier complet, installation portable, pannes, benchmarks et rapport de remplacement | Projections C1–C5 au fil des livraisons |

Ordre : C1 → C2 → C3 → C4 → C5 → C6. Les corrections de défauts affectant les tranches livrées restent prioritaires. Les transports providers indépendants peuvent être traités avant les workers et le streaming ; ils ne ferment pas leur chantier parent. Le changement de modèle déjà livré est conservé ; il ne ferme pas C5.

## C1.a Plans identifiables (tranche vérifiée, chantier parent IN_PROGRESS)

Liens : REQ-H01.4, REQ-H02.2, REQ-H09.1 ; critères parents restent ouverts.

Spécification avant code : nouveaux records plan version 1, identité stable dans un objectif, révision de record, tâches identifiables avec révision, résultat attendu et dépendances finies. Les tâches texte existantes restent supportées. La correspondance texte conserve les identités par occurrence ; les IDs explicites permettent une reformulation. Retirer une tâche ne permet pas de réutiliser son ID pour une autre tâche. Les dépendances absentes, réflexives ou cycliques sont refusées sans append. Aucun statut de tâche ne prétend certifier une réussite.

Un plan pour l’objectif courant reste consultable après correction mais est marqué current=false ; les champs ne sont pas automatiquement réadmis à R+1. Une nouvelle admission après correction requiert spec et tâches explicites. Les anciens records sont lus sans réécriture ni provenance inventée. Records v1 invalides refusés avant append et reload/listing. IDs du plan et tâches apparaissent dans le contexte partagé ; les champs tasks historiques restent disponibles pour compatibilité.

Vérification : identité préservée lors de phase/reformulation, doublons séparés, cycle/missing/refus sans append, correction sans reprise silencieuse, replay et corruption/version refusés, suite complète et garde différentielle. Pas de nouvelle dépendance, aucun changement core ni réseau.

## Points ouverts à ne pas masquer

C1.a ne livre pas encore export/vues terminal dédiées, édition humaine des tâches, critères renouvelés, délégation ni extraction automatique complète. Le graphe parent reste ouvert jusqu’à ces preuves.

## C0.a Configuration du lanceur (correction vérifiée)

Les réglages déjà autorisés de recherche/skills/budget disparaissent régulièrement de la working tree ; leur retrait casse test/skill-tools.test.ts. Cause inconnue, aucune attribution à un autre écrivain ou aux tests. Réintégrer la whitelist explicite dans la déclaration existante des variables transmises, vérifier que les variables non nommées restent exclues. Cette correction ne prétend pas résoudre la cause des modifications concurrentes. AC local : transmission des quatre variables nommées et aucune transmission wildcard ; tests launcher et suite complète.

## C2.a Mémoire extraite idempotente (tranche vérifiée, chantier parent IN_PROGRESS)

Liens : REQ-H03.1, REQ-H03.2, REQ-H01.4, REQ-H09.1. Friction observée dans remember : une seconde extraction des mêmes événements recrée une mémoire et peut ressusciter une interprétation déjà corrigée par l’humain.

Spec : les nouveaux remember create portent une version et une clé déterministe fondée sur kind, texte exact et sources triées/dédupliquées. Une extraction identique retrouve le record initial sans append, même après correction humaine ou résolution. Des sources distinctes restent distinctes ; une interprétation contradictoire reste distincte, sans remplacer un record humain. Les nouveaux records portent objectif/révision connus ou null ; les sources doivent précéder le record. Edit/resolve exigent un record modèle existant ; modèle ne modifie jamais un record devenu humain. Version/schema invalides refusés avant append/reload ; les anciens records restent conservés et consultables sans nouvelle provenance. La clé ne constitue pas une preuve de vérité et ne déduit pas une sémantique équivalente.

Vérification : même extraction dans un ordre de sources différent, reprise réelle, correction/résolution humaine puis retry sans resurrection, sources différentes, version corrompue, refus sans append et suite complète. L’extraction sémantique reste choisie par le modèle via remember ; aucune prétention à l’extraction automatique exhaustive de tous les faits.

Preuves C1.a/C0.a : EV-WORK-PLANS, 11 tests ciblés et suite 719/717/0/2. Les critères parents restent ouverts ; aucun chantier global clos.

Preuves C2.a : EV-MEMORY-IDEMPOTENCE ; historique isolé FAIL, 12 ciblés PASS et suite 722/720/0/2 PASS. Les six chantiers restent en cours ou ouverts.

## C5.a Anthropic direct (tranche transport vérifiée, live pending)

Tranche de transport indépendante des futurs workers : REQ-H07.1 et H07.5 ; contrat et autorité inchangés. Sources officielles consultées le 2026-10-01 : https://platform.claude.com/docs/en/api/messages/create et https://platform.claude.com/docs/en/api/models/list .

Spec avant code : provider anthropic explicite, ANTHROPIC_API_KEY hors préférences/journal, modèle et maxTokens explicitement déclarés (Messages exige max_tokens). Endpoint fixe HTTPS, headers x-api-key/anthropic-version, system séparé et message user contenant uniquement le frame actuel ; outil enveloppe traduit en tool_use natif, puis proposition validée avant retour au harness. Aucun effet direct, retry ou fallback payant. Réponses tronquées, JSON/enveloppes/outils invalides refusés ; arrêt propagé y compris après réponse tardive. Erreurs transport/auth/quota expurgées sans corps provider. Usage input/output connu exposé à l’adaptateur ou null, jamais converti en coût fictif. Catalogue API paginé, cancellable, IDs non hardcodés, saisie libre conservée. Provider ajouté à la fin de la liste pour préserver les touches des sélecteurs existants.

Vérification : résolution explicite/refus clé-modèle-plafond manquants, headers/body, tools complets/malformés/troncature, erreurs sans secrets, abort tardif, catalogue paginé et cycle, sélection persistée sans clé, tests UI existants, compilation différentielle, régression complète. Essai payant uniquement sous opt-in explicite : absence d’essai live laisse H07.1 ouvert. Streaming et comptabilité cumulative restent H07.4, non livrés par cette tranche.

Preuves C5.a : EV-ANTHROPIC-TRANSPORT, 19 ciblés PASS, cas Ink plafond obligatoire PASS, full 727/725/0/2 PASS. H07.1 ne peut être clos sans essai live configuré.
