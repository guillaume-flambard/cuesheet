# AR-T04 — routage de modèle adaptatif borné (paquet OpenCode)

Statut du paquet : spec puis IMPLEMENTING. Le produit entier reste IMPLEMENTING ;
ce document ne déclare ni AR03/AR04/AR-T04 terminé ni intégration effectuée.

## 1. Intent

Le contrôleur doit pouvoir choisir une route de modèle pour une unité de travail
à partir de candidats qu'il fournit lui-même, sans que le module lise un
catalogue, un fichier de préférences ou un réseau. Le choix respecte quatre
priorités dans l'ordre : choix humain explicite, suggestion de modèle (jamais
autorisation), route par défaut `opencode-go/deepseek-v4.1-flash`, puis ordre
d'observation déterministe. Une demande humaine indisponible produit un refus
explicite, jamais un remplacement silencieux. Les résultats de route sont
journalisés avec provenance et classification honnête ; coût inconnu reste null.

Non-goals : appel provider, écriture de préférences globales, classement de
qualité de modèle, prix ou benchmarks inventés, intégration producer/UI
(parent), enveloppe épistémique AR04 complète, budget AE01 (le contrôleur
fournit les plafonds).

## 2. Carte locale système / API

- `src/core/store.ts` : `Event` (`seq`, `at`, `kind`, `subject`, `data`),
  `NewEvent = Omit<Event,'seq'|'at'> & {at?:number}` ; `EventStore.append`
  reassuit `seq`/`at` et ne lit jamais l'horloge si `at` est fourni.
- `src/adapters/agent-models.ts` : routes humaines par rôle sur
  `terminal.agent-model`, auteur `human`, sans routage adaptatif. Réutilise le
  vocabulaire de refus « indisponible sans fallback ».
- `src/adapters/model-preferences.ts` : préférences globales non secrètes
  (`saveModelPreferences`). Le module ne doit pas l'importer.
- `src/adapters/model-catalog.ts` / `default-model.ts` : catalogue et
  résolution provider ; hors périmètre, aucune lecture.
- `src/adapters/model-usage.ts` : reçus `started/observed`, coût inconnu `null`
  (`summarizeUsage.cost === null`). Modèle de journal repris pour la
  validation stricte `version`, bornes et transitions.
- `src/adapters/agent-assistance.ts` : helper `recordX(base, append)` qui refuse
  une transition invalide avant append. Repris pour `recordRoute`.
- `src/adapters/agent-consultation.ts` / `code-worker-loop.ts` : futurs
  consommateurs, câblés par le parent après ce rapport.
- Tests : `node --test` en type stripping, imports `.ts`, `assert/strict`,
  `EventStore` injecté avec horloge fixe.

API exportée par `src/adapters/adaptive-model-routing.ts` (contrat parent) :

```text
ROUTING_SUBJECT, ROUTE_DECISION_CODES, REJECTION_CODES, ROUTE_OUTCOME_CLASSES,
DEFAULT_ROUTE_PROVIDER, DEFAULT_ROUTE_MODEL
RouteCandidate, RouteNeed, RouteSelectionOptions, RouteDecision,
RejectedCandidate, RouteDecisionCode, RejectionCode, RouteOutcomeClass
RouteRequestRecord, RouteOutcomeRecord, RouteOutcomeInput, RouteJournalEntry
selectRoute(need, candidates, options) -> RouteDecision        (pur, throw si entrée malformée)
compareRouteCandidates(a, b) -> number                         (ordre total déterministe)
isDefaultRoute(candidate) -> boolean
routeRequest(decision, requestId) -> RouteRequestRecord
routeOutcome(request, input) -> RouteOutcomeRecord             (provenance par construction)
appendRouteRequest(record, append) -> Event
appendRouteOutcome(record, append) -> Event
recordRoute(request, append) -> (outcome) => Event             (request immédiat, outcome unique)
projectRouting(events) -> RouteJournalEntry[]                  (replay strict, throw)
providerCooldowns(entries, {now, cooldownMs}) -> Map<provider, until>
```

## 3. Exigences et acceptation

REQ-01 Candidats contrôleur only : `selectRoute` accepte uniquement des
candidats fournnis (id, provider, model, authorized, capacités connues,
latence observée optionnelle, inFlight optionnel) ; tout champ malformé ou id
dupliqué lève une erreur ; aucun candidat n'est fabriqué depuis un catalogue.
AC-01 : test entrée malformée/dupliquée rejette ; test source sans
`listModels`/`fetch`/`execFile`.

REQ-02 Priorité humaine sans remplacement : un `humanChoice` admissible est
 sélectionné ; s'il est absent de la liste, non autorisé, bloqué par cooldown
 ou incompatible, la décision est `refused-human-choice-unavailable` et aucun
 autre candidat n'est choisi.
AC-02 : test choix humain gagne sur le défaut ; test choix indisponible →
refus, `candidate === null`, alternatif admissible présent dans `rejected`.

REQ-03 Défaut sans écriture globale : sans choix humain ni suggestion, la route
`opencode-go/deepseek-v4.1-flash` admissible est choisie (`default-route`) ;
le module ne écrit aucune préférence globale.
AC-03 : test défaut choisi ; test défaut non autorisé → ni sélection ni écriture
; test source sans `saveModelPreferences`/`prepareModelPreferences`/`Date.now`.

REQ-04 Une suggestion ne autorise jamais : `need.suggestion` ne peut sélectionner
un candidat non autorisé ou inconnu ; elle est ignorée et la priorité suivante
s'applique.
AC-04 : test suggestion sur candidat non autorisé → défaut choisi, candidat
suggéré dans `rejected` avec sa raison propre.

REQ-05 Compatibilité de capacités connues : si le besoin exige des capacités,
le candidat doit les déclarer connues et toutes les contenir ; capacité
inconnue ou manquante exclut le candidat.
AC-05 : test capacité inconnue exclue (`capability-unknown`) ; test capacité
manquante exclue (`capability-missing`) ; test besoin sans capacité accepte un
candidat à capacités inconnues.

REQ-06 Backpressure : un refus `quota`/`auth` sur un fournisseur impose un
cooldown jusqu'à `at + cooldownMs` évalué sur un `now` explicite ; un
`inFlight` collectif `>= maxInFlight` refuse toute admission.
AC-06 : test provider en cooldown exclu puis ré-admis après expiration ;
test `tool-failure` ne crée aucun cooldown ; test cap → `refused-in-flight-cap`.

REQ-07 Classification honnête des résultats : `success`, `quota`, `auth`,
`invalid-format`, `tool-failure`, `cancelled` enregistrés avec refId,
objectif/tâche et coût `number|null` ; coût inconnu reste `null` ; un
`tool-failure` n'est jamais requalifié en qualité de modèle.
AC-07 : test coût null projeté null et coût invalide rejeté ; test chaque
classification projetée à l'identique ; test `tool-failure` sans cooldown ni
champ de qualité.

REQ-08 Décision lisible et identité stable : la décision porte code, raison,
chaque alternative rejetée avec motif, et recopie `workId`/`role`/`refId`/
objectif/tâche du besoin ; aucun champ qualité/prix/benchmark n'existe.
AC-08 : test identité identique besoin → décision → requête → résultat ; test
clés interdites absentes même si le candidat les transporte ; test tout
candidat non choisi apparaît dans `rejected`.

REQ-09 Replay à provenance stricte : `projectRouting` rejette journal malformé,
`seq` non strictement croissant, id de requête dupliqué, résultat sans requête,
résultat sur requête refusée, double résultat, et divergence
workId/refId/objectif/tâche/candidat.
AC-09 : tests de rejet un par un ; append de requête échoué → aucun résultat
possible ; `recordRoute` refuse un second résultat.

REQ-10 Déterminisme : le choix ne dépend pas de l'ordre des candidats ; les
égalités d'observation sont départagées par ordre total exporté se terminant
sur l'id.
AC-10 : test même sélection avec liste inversée ; test `compareRouteCandidates`
réfléchi/transitif sur candidats identiques sauf id.

## 4. Graphe TODO fini

- TODO-P0-01 Types, constantes et validations d'entrée. → AC-01
- TODO-P0-02 `selectRoute` (priorités, capacités, cooldown, cap) et
  `compareRouteCandidates`. → AC-02..AC-06, AC-08, AC-10
- TODO-P0-03 Écrireurs `routeRequest`/`routeOutcome`/`append*`/`recordRoute` et
  `projectRouting`/`providerCooldowns`. → AC-07, AC-09
- TODO-P0-04 `test/adaptive-model-routing.test.ts` et exécution. → tous
- TODO-P0-05 Preuves et limites dans ce rapport. → clôture du paquet

Aucun P2/P3. Aucun TODO hors périmètre des trois fichiers autorisés.

## 5. Risques

- R1 (moyen) : le parent peut différer `at` entre requête et résultat, ce qui
  déplace l'expiration du cooldown. Atténuation : `providerCooldowns` utilise le
  `at` du résultat, jamais l'horloge du module.
- R2 (moyen) : `inFlight` non fourni compte 0 dans la somme collective ; un
  contrôleur qui n'observe pas peut sous-estimer la pression. Atténuation
  documentée, le plafond appartient au contrôleur AE01.
- R3 (faible) : un seul résultat par requête ; une nouvelle tentative exige une
  nouvelle requête. Limite assumée, documentée.
- R4 (faible) : le cooldown n'est pas levé par un succès ultérieur, il expire
  seulement avec le temps. Conservateur, volontaire.
- R5 (moyen, hors périmètre) : rien n'est câblé dans producer/consultation/UI ;
  AR-T04 ne peut pas être déclaré terminé sur la seule présence du module.

Aucun risque critique ou élevé ouvert dans ce périmètre.

## 6. Plan de vérification (avant code)

1. `rtk node --test test/adaptive-model-routing.test.ts` — seule commande
   exécutée, aucun build ni suite complète pendant que les pairs travaillent.
2. Revue de source du module : absence de `Date.now`, `fetch`, `execFile`,
   `listModels`, `saveModelPreferences`, `prepareModelPreferences`.
3. Vérification adversariale : entrée malformée, journal inversé, résultat sans
   provenance, cap, cooldown expiré, suggestion malveillante, coût fabriqué.
4. État final : le rapport porte preuves et limites ; `state.json` reste
   propriété du parent.
