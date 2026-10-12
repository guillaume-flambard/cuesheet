# CUESHEET — audit des harnesses et mécanismes utiles (12 octobre 2026)

> **ÉTUDE, PAS PREUVE D'IMPLÉMENTATION.** Relecture des sources publiques GitHub et documentations primaires. Les produits tiers changent vite : toute intégration exige la version et le commit réellement vérifiés. Ce document actualise et complète [REFERENCE-DEEP-DIVE-2026-10.md](REFERENCE-DEEP-DIVE-2026-10.md), sans effacer l'historique. La feuille de route active est [TODO.md](TODO.md)/[state.json](state.json) ; le programme d'exécution est [HARNESS-PROGRAM-2026-10.md](HARNESS-PROGRAM-2026-10.md).

## Vision à défendre

**CUESHEET n'est pas un onzième agent de code : c'est un runtime universel qui garde l'intention humaine, les autorisations, l'état du monde et les preuves alors que les agents et les modèles sont interchangeables.** Une requête n'a besoin ni de Git ni d'un répertoire, et peut évoluer de conversation -> recherche -> spécification -> fichier -> produit sans changer de contrat. Pas de fausse clôture sur parole du modèle, pas d'effet incertain rejoué automatiquement, pas de permission créée par un skill.

Le dépôt actuel est déjà substantiel (TS/Node>=22, EventStore, contrats et projections, effect receipts, recherche, mémoire partagée, worktrees, worker pool, TUI React/Ink, CI auto-merge, plus de mille tests sur Ubuntu). Ne pas superposer un framework qui crée une deuxième vérité ; reproduire un défaut, ajouter le test de contrat, modifier la frontière existante.

## Classement 2026 : pertinence des *mécanismes à étudier*, pas palmarès de popularité

| Rang | Référence | Mécanisme le plus précieux | Priorité CUESHEET | Ce qu'on ne copie pas |
| --- | --- | --- | --- | --- |
| 1 | Pi / pi-durable | tâches/checkpoints durables, architecture petite, extensions et événements dérivés | Immédiat P1/P2 | aucune promesse d'OS sandbox intégré ; pi-durable est expérimental |
| 2 | OpenCode V2 | inbox persistée avant wake, steering/queue, recovery des tool runs, compaction | Immédiat P1 | architecture Effect réécrite en bloc |
| 3 | LangGraph | checkpoints et interruptions, modes sync/async/exit, reprise déterministe | Immédiat P1 | utiliser le checkpoint comme deuxième vérité |
| 4 | OpenAI Codex | policy tool/approvals et séparation control-plane/sandbox | Immédiat P0/P1 | prendre `cwd` ou filtres argv pour un confinement OS |
| 5 | Claude Code | hooks, subagents, skills et compréhension humaine de la délégation | P2 | worker qui s'auto-vérifie |
| 6 | OpenHands SDK + Canvas | agent/sdk distinct d'executor sandbox, server et UI | P2/P3 | énorme dépendance ou serveur obligatoire |
| 7 | Letta | mémoire durable structurée, blocks détachables, plusieurs conversations par agent | P2 | mémoire LLM déclarée vérité observée |
| 8 | Hermes Agent + Self-Evolution | skills à la demande, expériences, optimisation par données et PR | P2/P3 | auto-promotion de skills non mesurés ou prompts malveillants |
| 9 | Goose | MCP, transport CLI/desktop/API, extension manager dynamique | P2/P4 | copie de la TUI ou Rust par réflexe |
| 10 | mini-SWE-agent | harness témoin minimal et protocoles de benchmark | Transversal P0/P5 | confondre SWE-bench et évaluation du produit universel |

**Évolution notable du dépôt Pi** : l'ancien URL https://github.com/badlogic/pi-mono redirige aujourd'hui vers https://github.com/earendil-works/pi. Le monorepo annonce `pi-durable`, `chord`, `pi-ai`, `pi-agent-core`, `pi-coding-agent` et `pi-tui`. Le module durable est explicitement **expérimental**. Sa documentation décrit des tâches propriétaires par conversation, des transitions persistées et des flux événementiels dérivés du journal. Intérêt : interfaces de tâche et checkpoint, **pas import de la stack**.

## Analyse par principe / source / écart / preuve

### 1. Durabilité : Pi Durable, LangGraph et OpenCode V2

- Pi Durable [source](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md) : task propriétaire + checkpoints + events en deltas ; attention aux limites API expérimentales.
- LangGraph [checkpoints](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/checkpointers.mdx) et [interrupts](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/interrupts.mdx) : `sync/async/exit` n'offrent pas la même résistance au crash. Reprendre un node n'implique pas que ses effets externes sont idempotents.
- OpenCode [contrat V2 sessions](https://github.com/anomalyco/opencode/blob/dev/specs/v2/session.md) : admission durable des inputs, orchestration des wakeups, récupération explicite des appels orphelins. **La spec V2 est à comparer au code réellement livré à une révision donnée**.
- CUESHEET : événements append-only, admission intent-before-effect, refus de replay d'actions génériques sans receipt et réconciliation distincte du contrôleur terminal déjà présents. Écarts : checkpoints versionnés/cursor/digest, migrations sûres, classification fine UNKNOWN/idempotent et stress/longue durée.
- Gate : crash à chacun des six instants du cycle, redémarrage avec nouveau modèle, 0 effet secondaire dupliqué, un état UNKNOWN documenté quand la réalité est impossible à établir.

### 2. Sandboxing et frontière de confiance : Codex et OpenHands

- Codex [code](https://github.com/openai/codex), OpenAI [control-plane/sandbox](https://developers.openai.com/api/docs/guides/agents/sandboxes) et [security](https://developers.openai.com/api/docs/guides/agents-api/environments/security) : séparer les credentials, scopes, approbations et policies de l'environnement où tourne le code non fiable. Ne pas mettre de secret durable dans un sous-processus agent.
- OpenHands SDK [architecture](https://github.com/OpenHands/docs/blob/main/sdk/arch/overview.mdx) : SDK/Tools/Workspace/Agent Server découplés ; [Agent Canvas](https://github.com/OpenHands/OpenHands/blob/main/docs/architecture.md) rend sans décider des permissions ni exécuter lui-même les outils.
- CUESHEET : adapter tool-route, node capsule, container tools, worker workspace présents. Écarts : capacités OS réellement enforceables documentées par plateforme, tests d'évasion read/write/network, provenance du receipt.
- Gate : une commande autorisée ne peut écrire hors scope par les capacités OS ; un workspace indisponible bloque sans fallback local implicite ; secrets restent hors contexte outil.

### 3. Ordonnancement/steering : Claude Code + OpenCode V2

- Claude Code [subagents](https://code.claude.com/docs/en/sub-agents) et [hooks](https://code.claude.com/docs/en/hooks) : délégation des tâches et points de lifecycle.
- OpenCode V2 : `steer` livré à une frontière sûre, `queue` pour le travail à venir, opérations d'admission idempotentes, coordination process-local explicite.
- CUESHEET : Work Graph, scopes et workers existants ; vérifier l'effet d'un changement humain R+1 pendant un outil bloquant ou deux workers concurrents.
- Gate : correction reçue pendant streaming annule l'autorité des vieux effets, mais préserve les observations faites ; un worker ne peut cloturer avec une preuve de R précédente.

### 4. Providers et portabilité : Pi AI, OpenCode, Goose

- Pi AI [monorepo](https://github.com/earendil-works/pi) : API providers homogène, agent-core et UI dissociés.
- OpenCode [repo](https://github.com/anomalyco/opencode) : protocole de session et modèle à la frontière.
- Goose [MCP extensions](https://github.com/aaif-goose/goose/blob/main/documentation/docs/getting-started/using-extensions.md) et [extension manager](https://github.com/aaif-goose/goose/blob/main/documentation/docs/mcp/extension-manager-mcp.md) : filtrer/charger les outils selon le besoin, plutôt que tout exposer en permanence.
- CUESHEET : Anthropic/OpenRouter/OpenCode/LLM adapters existants ; écarts : capacités réellement observées, par provider, pricing, AbortSignal/streaming et source de repli contrôlée.
- Gate : même fixture logique sur 2 providers (live si consentement/budget), pas de late tool après switch/abort, limites inconnues explicitement UNKNOWN.

### 5. Mémoire/skills et auto-amélioration : Letta et Hermes

- Letta [stateful agents](https://docs.letta.com/concepts/stateful-agents) et [blocks](https://docs.letta.com/tutorials/attaching-detaching-blocks/) : mémoire durable partagée entre conversations, accès par blocs et contexte sélectif.
- Hermes [skills](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) : compétences procédurales chargées à la demande, sources/provenance. Le dépôt [hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) propose optimisation de skills via traces + DSPy/GEPA et gates expérimentaux : état des phases à vérifier au commit.
- CUESHEET : mémoire, sessions, skills, research déjà présents. Écarts : provenance forte, temps de validité, contradiction humaine vs LLM, retrieval des sources omises, corpus de régressions pour skill, promotion en PR.
- Gate : skill proposé sur fixture A améliore indépendamment B sans autorisation supplémentaire ; un texte externe hostile n'est jamais adopté comme instruction système.

### 6. Évaluation crédible : mini-SWE-agent + mesures maison

- mini-SWE-agent [repo](https://github.com/SWE-agent/mini-swe-agent) : boucle minimale utile comme témoin, pas benchmark universel.
- Pi [telemetry schema](https://github.com/earendil-works/pi/blob/main/packages/agent/docs/telemetry-schema.md) : span run/turn/step/checkpoint, statut et tentative observés.
- CUESHEET : ledger d'expériences et scénario IntentLane existants. Manquent : score `PROVEN` sur oracle indépendant, faible/fort modèle, budget et tokens, incidents, répétitions et comparaison appariée.
- Gate : fixtures précises, code SHA, model/provider, tokens/coûts connus ou UNKNOWN, oracle indépendant, run logs épurés, limites. Ne jamais inférer l'avantage concurrentiel des seules étoiles.

## Ce que nous ne faisons pas

- **Pas de rewrite Rust** : TypeScript d'abord, mesure de mémoire/latence avant ADR.
- **Pas d'import LangGraph/OpenHands/Pi Durable comme nouveau core** : ils inspirent un contrat, pas un deuxième State Graph.
- **Pas de « 10 agents à chaque demande »** : déléguer si compétences et scopes rendent le gain plausible.
- **Pas de skill auto-proclamé meilleur** : évaluer une variante sur des fixtures tenues hors du producteur.
- **Pas de roadmap qui ferme H01-H10** : une seule source canonique de vérité et des preuves liées à un commit.

## Traçabilité de la recherche

Sources primaires vérifiées via pages GitHub/docs le 12-10-2026 ; pas de benchmark comparatif exécuté sur ces projets tiers. Les liens ci-dessus sont des points de recherche, pas des versions reproductibles. Pour convertir une idée en dépendance, pinner un tag/SHA, faire revue licence/supply chain et créer une ADR. Les anciennes transcriptions « QSheet », « MiniSW », « Open NNS », « LLaMA » sont résolues dans REFERENCE-DEEP-DIVE, mais LLaMA reste un **modèle**, pas un harness.
