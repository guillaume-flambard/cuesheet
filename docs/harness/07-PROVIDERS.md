# H07 : providers, modèles et streaming

## Résultat

La personne peut choisir un provider et un modèle, les changer pendant le travail,
et laisser le harness utiliser les capacités effectivement disponibles. Le choix
préserve objectifs, contrat, mémoire et journal. Les choix automatiques respectent
les routes et plafonds autorisés.

## Providers

Conserver OpenCode, OpenRouter, OpenAI et les endpoints compatibles. Ajouter un
adaptateur Anthropic direct en se fondant sur la documentation officielle au moment
de l'implémentation. Tester les différences de messages, tools, tokens, usage,
erreurs et abort. Un compatible n'est pas supposé implémenter toutes les fonctions
d'OpenAI ; négocier ou configurer les capacités.

Les authentifications par abonnement/OAuth exigent un protocole officiellement
supporté et un connecteur explicite. Ne pas récupérer des tokens depuis les bases
d'une autre application ni supposer qu'un abonnement donne accès à une API. En
l'absence de route supportée, documenter l'indisponibilité et conserver les
transports configurés. Les credentials restent hors des préférences, frames,
journaux et snapshots exportés.

## Choix et changement

Définir capacités par modèle : fenêtre de contexte, outils, streaming, types
d'entrée et limites connues. Distinguer inconnu et non supporté. Les catalogues
restent cancellables et une saisie manuelle reste possible. Ne pas hardcoder une
liste supposée actuelle de modèles ni leurs tarifs.

Un changement pendant une inférence se fait à une frontière sûre : demander
l'arrêt de cette inférence, rejeter son résultat tardif, terminer/reconcilier les
effets déjà démarrés, enregistrer la sélection, reconstruire le contexte et
reprendre selon l'état autorisé. Afficher « changement en attente » si l'effet
ne peut être interrompu. Une erreur de nouveau provider garde un état cohérent
et donne accès au sélecteur.

Le routing automatique est une préférence explicite : uniquement parmi les
routes configurées et autorisées, avec une justification enregistrée. Une erreur
locale ne déclenche pas silencieusement une route payante. L'utilisateur peut
épingler un modèle et désactiver le routing.

## Streaming

Ajouter une interface de flux adaptée à plusieurs providers. Les fragments de
texte sont une présentation provisoire ; les appels d'outils ne sont admis qu'une
fois complets et validés. Un flux interrompu ne produit pas un outil partiel ni une
fausse réponse finale. Réduire les écritures de vue tout en garantissant la
durabilité des faits ; mesurer fréquence de refresh et comportement après crash.

## Acceptation et tâches

- [ ] H07.1 Anthropic direct et contrats par provider avec docs et essais réels.
- [ ] H07.2 Capacités de modèles et contrôle des limites de contexte.
- [ ] H07.3 Changement en cours à une frontière sûre et rollback cohérent.
- [ ] H07.4 Streaming, tool payloads complets, usage et abort.
- [ ] H07.5 Routing optionnel et authentifications réellement supportées.

Tests : provider manquant, erreur auth, 429, catalogue indisponible, chunk invalide,
tool JSON incomplet, changement en plein flux, réponse tardive ignorée, provider
avec petite fenêtre, usage inconnu, aucune clé dans journaux ou traces, route
payante non autorisée non utilisée. Réaliser les essais réseau explicitement
configurés et distinguer ces résultats des transports simulés.

Dépendances : H03, H05 pour changement actif. Réutiliser `default-model.ts`,
`model-binding.ts`, `model-catalog.ts`, `model-preferences.ts`, `binary-model.ts`
et `openrouter.ts`.

## Tranche H07.4a : usages durables Anthropic

Le transport natif émet un receipt avant dispatch, puis un usage si la réponse JSON rapporte ces compteurs, même si les propositions sont ensuite refusées (troncature/outils invalides). Avant dispatch n'affirme ni facture ni lancement reçu. Une interruption ou une réponse illisible laisse l'usage inconnu. Chaque requête porte un UUID propre, provider et modèle demandé ; un changement de modèle conserve l'identité du transport de chaque requête.

Une autorité dédiée de consommation `<session>.usage.jsonl` est raccordée au runtime terminal, sous sa claim existante. Elle ne change pas le journal d'intentions ni la révision de proposition. Pas de texte/prompts/API keys/erreurs brutes dans les receipts. Le ledger est append-only, v1 validé avant append et au replay ; doublons/refus de fin sans début sont rejetés. Read ne crée rien, reload conserve les compteurs. Échec d'écriture avant dispatch interdit la requête ; échec après réponse interdit l'admission de ses outils.

Compteurs rapportés Anthropic : input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, validés comme entiers positifs ou nuls ; champ absent/invalide devient inconnu, jamais zéro. Agrégats de compteurs connus sous forme décimale exacte et nombre d'inconnus par compteur, sans mélange cache/entrée. Aucun prix/budget total garanti : cost null. Une tentative sans receipt final demeure pending. Pas d'extrapolation du corps ou des caractères en tokens.

Source officielle : https://platform.claude.com/docs/en/build-with-claude/prompt-caching (les trois catégories d'entrée sont distinctes). Vérification : réponse tronquée mais usage conservé ; abort/panne garde pending ; double receipt refusé ; modèle/callback conservés après sélection ; real disk reload/corruption sans rewrite ; runtime branche le sink ; suite et typing. H07.4 parent reste ouvert : autres providers, streaming et plafonds/routing distincts.
