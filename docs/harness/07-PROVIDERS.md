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

## Fabric de modèles résilient

Tout provider externe peut échouer. Quota épuisé, limite atteinte, timeout, perte
réseau, indisponibilité, surcharge, dépassement de contexte, réponse malformée,
flux interrompu, authentification absente, modèle renommé ou retiré : ce sont des
événements d'infrastructure, pas des échecs de travail.

Une panne de provider ne doit pas devenir une panne de travail. Le modèle n'est
pas l'identité du worker. Un worker porte son état de travail, sa capsule de
contexte, ses capacités requises et ses preuves accumulées ; le modèle est du
calcul remplaçable. Le provider expose des modèles et n'est pas encodé dans l'état
de travail. Le routage va du travail vers les exigences de capacité, puis vers le
modèle, puis vers un provider disponible.

Avant toute inférence coûteuse, un point de reprise durable existe déjà hors du
modèle : unité de travail, intention courante, révision de contexte,
constats établis, preuves, question ouverte et contrat de sortie attendu. Si le flux
meurt après quarante secondes, le modèle est perdu et l'état du worker reste
intact ; un autre modèle continue.

### Idempotence des effets

Distinguer inférence, effet demandé, effet observé et preuve durable. Avant
d'exécuter un effet, vérifier s'il a déjà été observé : si oui, réutiliser le
résultat. Si un réseau coupe après la création d'une migration, le modèle suivant
ne doit pas la recréer.

### Classification avant reprise

Transient : timeout, reset réseau, 5xx, flux interrompu, donc reprise avec backoff.
Quota épuisé : ne pas réessayer en boucle, marquer indisponible sur l'horizon
adapté et basculer. Contexte dépassé : ne pas renvoyer la même requête, réduire ou
décomposer le contexte, ou choisir un modèle à fenêtre plus large. Échec
d'authentification : ne pas marteler le provider, marquer indisponible. Modèle
indisponible : mettre le catalogue à jour et rerouter. Requête invalide : corriger
la requête, un autre provider ne répond pas à une requête invalide.

### Bascules

Le remplacement doit préserver les capacités exigées par l'inférence courante :
outils, taille de contexte, force de code, latence admissible. Si aucun équivalent
n'existe, réduire la requête en sécurité, décomposer le travail, escalader vers un
autre provider, ou remonter la limite à la personne. Jamais de dégradation silencieuse
sous le niveau requis. L'échelle est dynamique, requirements plus disponibilité
courante plus coût plus latence plus qualité plus budget restant. Un modèle préféré
en panne ne force pas l'usage d'un modèle cher si un modèle suffisant et gratuit
existe.

### Disjoncteurs et protection du troupeau

Si un provider échoue à répétition, ouvrir un disjoncteur, le retirer du routage,
sonder périodiquement, puis refermer en demi-ouvert sur sonde réussie. Avec une
équipe élastique, la pression provider est vue globalement : réduire la concurrence,
répartir les workers sur plusieurs modèles et providers, différer l'inférence non
critique, prioriser le chemin critique. Trente workers ne répéteront pas le même
mur. La backpressure est globale, pas par worker. Le quota est une ressource de
budget au même titre que les tokens, l'argent, le temps, la CPU et la mémoire.

### Invariants

1. Les providers sont de l'infrastructure, les modèles sont du calcul remplaçable,
   les workers sont durables, l'intention survit à la panne. Si une limite de quota,
   une coupure réseau ou une indisponibilité peut détruire une mission
   récupérable, l'architecture du runtime est fausse.
2. Une panne de calcul locale n'est pas une panne du flux global. L'échec d'un seul
   worker ou provider n'affecte que la plus petite partie possible du graphe ; le
   travail indépendant continue.
3. Un modèle ne dégrade jamais silencieusement sous les capacités requises, et
   l'identité du worker, l'unité de travail et les preuves accumulées survivent à
   toute bascule.
4. La récupération est visible sans être intrusive. Les reprises normales se
   montrent en une ligne sobre ; on n'interrompt la personne que si aucune
   alternative acceptable n'existe, si des credentials sont requises, si la
   politique de coût serait dépassée, ou si l'intention ne peut pas continuer sans
   danger.

### Dégradation gracieuse et hedges mesurés

Si seuls des modèles faibles ou gratuits restent, changer de stratégie plutôt que de
confier une décision d'architecture difficile à un modèle seul : exploration
déterministe, décomposition, plusieurs analyses ciblées peu coûteuses, vérification
indépendante et synthèse. Le runtime compense un modèle plus faible par une meilleure
ingénierie de harnais. Le model hedging, envoyer la même question bornée à deux
modèles en parallèle, ne se justifie que pour du travail sensible au temps et
incertain ; la première réponse étayée gagne, la requête inutile est annulée. La revue
peut employer délibérément une autre famille de modèle pour casser la corrélation de
défaillance, seulement si le risque justifie le calcul supplémentaire.

La politique de routage est un état vivant synchronisé avec l'exécution. La
personne peut dire « n'utilise aucun modèle payant », « seulement Zen et Go », «
pour celui-ci le plus fort disponible », ou « arrête d'utiliser ce modèle » ; les
workers actifs se réconcilient à la frontière sûre. Les performances réelles par
type de travail sont apprises de l'exécution, pas de impressions.

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

## Défaut H07.2b : ancien vocabulaire après changement de route

Découverte avant patch : OpenRouter/Binary choisissent le premier tools: du frame ; Anthropic fusionne tous les outils historiques. Après réouverture d'un ancien journal ou réduction d'une route, une commande ancienne peut donc rester au schéma alors que le runner ne l'admet plus. Le runner garde son refus ; ceci ne donne pas permission mais dégrade sélection/qualité.

Tranche : fonction d'adapter pour sélectionner la déclaration tools: valide de séquence la plus récente, ordre indépendant de la présentation, noms dédupliqués ; native Anthropic, compatible/OpenRouter et Binary utilisent la même règle. Aucune union des déclarations historiques, aucune récupération depuis contenu Vault/texte JSON ou arguments modèle. Sans déclaration conserver le contrat existant de chaque transport. Ne pas effacer les journaux/contraintes humaines pour corriger le schéma. Vérifier régression en échec avantpatch sur requests réelles capturées, mise à jour puis autres providers/typing/full ; pas de correction core.

## H07.1d — refus provider structuré sans fuite

Pilote2026-10-02 : opencode/big-pickle disponible et listé Free dans docs officielles, mais native OpenCode1.18.34/--pure/proposer sans outils renvoie HTTP403 FreeTierError « free tier can only be used from within OpenCode ». Trois essais conservés (un pilote et deux diagnostics), source/goal intacts, aucun résultat de qualité modèle. Ne pas contourner restrictions, ne pas fallback payant ni accorder outils natifs.

REQ-H07.1/REQ-H09.5, AC-H07.1/AC-H09.5. parseProposal doit classifier uniquement events type=error/APIError avec status HTTP400–599 :401auth,403access/free-tier exactknowncategory,429rate,5xxunavailable. Message éditorial fixe, aucun stdout/stderr arbitraire, headers/body/key/url/config jamais recopiés. Cascode0eventerror refuseaussi ; tool_event toujoursviolationfatégate, truncated/malformed restentrefus. Pasd'heuristique surtexte réponse normale. Lesautresnonzeroexitsaffichentexit/incomplétude sansrawstderr; sourcefailureattributionproviderconservée. Testscanaryapikey/headers/stderrrefus absents et native403represented, safeactions choisirprovider/modèleadmisviaUIexistante. N'optepas automatiquementsurunmodèlepayant.
