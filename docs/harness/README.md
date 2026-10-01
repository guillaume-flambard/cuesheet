# Cuesheet : dossier d'exécution du harness autonome

État de référence : commit `f4f05bf`, 2026-10-01. Ce dossier spécifie le produit
complet demandé par le propriétaire et les travaux restant à réaliser. Il ne
déclare pas ces travaux implémentés.

## Contrat produit

Une personne exprime une intention et apporte ses corrections en langage naturel.
Cuesheet transforme cette intention en objectifs maintenables, choisit les étapes
utiles, organise les agents, conserve le savoir et poursuit le travail. Il produit
une spec, un plan, des tâches ou un skill lorsque cela aide à atteindre l'objectif.
L'utilisateur peut consulter et modifier ces choix, sans devoir les gérer.

La qualité attendue et les critères de réussite restent identiques quand le modèle
change. Le harness compense les erreurs par l'observation, la décomposition, la
révision et le relais. Il rapporte honnêtement une incapacité à réussir. Il ne
promet pas une capacité identique entre tous les modèles.

Un objectif n'expire pas parce qu'une inférence, un outil ou une tranche
d'exécution atteint sa limite. Des limites techniques et de dépense bornent les
opérations ; elles laissent l'objectif reprenable. L'arrêt explicite de la personne
prime sur toute continuation automatique.

## Ce qui existe réellement

| Brique | État à la référence | Limite |
| --- | --- | --- |
| Sessions terminal | Journaux core et vue persistants, chargement, reprise explicite | Un seul propriétaire du journal terminal ; reprise non automatique |
| Providers | OpenCode, OpenRouter, OpenAI, compatible, Anthropic direct ; choix interactif, préférences | Anthropic live non vérifié ; pas de streaming complet |
| Validation | Check déclaré, octets épinglés, capture et preuve indépendante | Critère déclaré hors du parcours conversationnel |
| Corrections | Directive immédiate, propositions obsolètes rejetées | Pas d'éditeur complet d'objectifs |
| Mémoire | `/memory`, auteurs et sources, mutations append-only | Extraction automatique proposée au modèle, pas mesurée en production |
| Organisation | `organize_work`, spec et tâches textuelles | Identité du plan encore liée au texte du goal |
| Skills générés | `create_skill`, instructions de session sourcées | Ni découverte complète des skills installés, ni promotion validée |
| Contexte partagé | Projection reconstruite avant chaque inférence | Historique dupliqué, coût non borné |
| Workers | Projection et `temporaryWorker` avec refus/rebase | Pas de runtime terminal multi-agent concurrent démontré |
| Web | Non raccordé au terminal | Recherche, lecture et citations à implémenter |

La suite précédente compte 674 tests : 672 passent, 2 sont ignorés. C'est une
photographie historique, pas un résultat à recopier après modification. Le garde
TypeScript est différentiel : des diagnostics hérités restent présents.

## Lire selon le travail

1. Commencer par [TODO.md](TODO.md) et [HANDOFF.md](HANDOFF.md).
2. Identité, objectifs et vérification : [01-OBJECTIVES.md](01-OBJECTIVES.md).
3. Choix automatique des étapes : [02-AUTONOMY.md](02-AUTONOMY.md).
4. Mémoire et reconstruction : [03-MEMORY-CONTEXT.md](03-MEMORY-CONTEXT.md).
5. Recherche et skills : [04-RESEARCH-SKILLS.md](04-RESEARCH-SKILLS.md).
6. Reprise et budgets : [05-CONTINUITY.md](05-CONTINUITY.md).
7. Agents et état commun : [06-AGENTS.md](06-AGENTS.md).
8. Providers, modèles et flux : [07-PROVIDERS.md](07-PROVIDERS.md).
9. Terminal : [08-TERMINAL-UX.md](08-TERMINAL-UX.md).
10. Stockage, portabilité et outils : [09-RELIABILITY.md](09-RELIABILITY.md).
11. Qualité et remplacement d'OpenCode : [10-VALIDATION.md](10-VALIDATION.md).

Ce dossier est la roadmap consolidée du travail restant. Les docs existantes
restent les preuves et descriptions des tranches déjà réalisées. Une évolution
doit mettre à jour sa spec, sa tâche et son résultat observé ensemble.

Compléments Whole Project Protocol : [SYSTEM-MAP.md](SYSTEM-MAP.md),
[ACCEPTANCE.md](ACCEPTANCE.md), [WORK-GRAPH.md](WORK-GRAPH.md),
[RISKS.md](RISKS.md), [VERIFICATION.md](VERIFICATION.md) et [state.json](state.json).
Le statut courant est IMPLEMENTING, avec des P0/P1 et critères encore ouverts.

## Parcours qui décide de la réussite

Une feature arrive sans mode ni commande spéciale. Cuesheet inspecte le contexte,
cherche si nécessaire, construit un contrat d'objectif et une spec utile, exécute,
vérifie et corrige. La personne modifie la demande pendant le travail. Un agent
meurt ; un autre, avec un autre modèle, reprend après redémarrage. Les décisions,
contraintes, preuves et questions restent accessibles. Seul le résultat répondant
au contrat courant peut être déclaré validé.

Tout le périmètre ci-dessus doit être couvert avant de déclarer le dossier exécuté.
Les seuils de performance et qualité doivent être mesurés, avec les limites qui
restent. Aucun gain sur OpenCode n'est acquis par la seule présence de ces fonctions.
