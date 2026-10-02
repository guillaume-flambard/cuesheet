# EV-VERIFICATION-SELECTION-PROBE — ce que le moteur sait déjà choisir

2026-10-02 : sonde exécutée sur le graphe livré, avant toute écriture de spec.
Objectif : mesurer ce que `computeChangeImpact` rend réellement, au lieu de
supposer que le moteur sait déjà nommer les tests affectés.

## Ce que j'ai supposé, et ce que la sonde a mesuré

L'exemple de la direction verification adaptative suppose que
`computeChangeImpact(diff)` rend un plan du type :

    affected: model-router, worker-runtime
    tests: model-router.test.ts, provider-failover.test.ts
    invariants: MODEL-01, EFFECT-04

Sur le graphe réel et pour un fichier réellement modifié, la sonde rend :

| Sortie                          | `src/adapters/shared-memory.ts` | `src/adapters/state-graph/impact.ts` |
| ------------------------------- | ------------------------------- | ------------------------------------ |
| `seeds`                         | (aucun)                        | (aucun)                              |
| `unresolved`                    | le chemin lui-même              | le chemin lui-même                    |
| `complete`                      | `false`                        | `false`                              |
| `coverage.declared / unmapped`  | `0 / 1`                        | `0 / 1`                              |
| nœuds impactés                  | 0                              | 0                                    |
| tests nommés                    | 0                              | 0                                    |
| invariants touchés              | 0                              | 0                                    |

## Le bon comportement, quand même

Le résultat n'est pas un bug : c'est le mécanisme de l'élargissement. Un chemin
que le manifeste ne déclare pas ne peut pas produire un plan complet silencieux.
`complete: false` est la réponse honnête, et elle est exactement celle que la
direction décrit comme invariante : **un impact inconnu élargit la vérification,
jamais ne la réduit.**

## Ce qui existe déjà, mesuré

- `ownerCheckCatalog(graph)` rend **16 entrées** invariant vers check. La liaison
  invariant vers test existe donc déjà dans le manifeste.
- 16 nœuds `test` et 16 nœuds `invariant` sont déclarés.
- `ChangeImpactPlan` rend `unmappedPaths` et `coverage`, donc un lecteur peut
  détecter l'angle mort sans l'inférer.

## Les trois manques, dans l'ordre

1. **La couverture.** Le manifeste ne déclare que **8 fichiers `src` sur les 41
   présents dans `src/adapters`**. `shared-memory.ts`, `notifications.ts` et
   `managed-worktrees.ts` n'y sont pas. Tout changement sur ces fichiers rend
   `complete: false` et ne nomme aucun test. C'est la cause racine de la sonde
   vide, et elle est en amont du solveur. Rendre la couverture complète change
   les digests de l'artefact : cela appartient à SG01.3 ou à une tranche dédiée,
   jamais à SG02.3 en douce.

2. **La résolution vers un fichier de test.** Le catalogue donne un check, mais
   rien ne relie un nœud `test` impacté à un chemin de fichier exécutable, donc
   aucun nom de fichier de test n'est produit. Le graphe connaît les tests comme
   identifiants, pas comme commandes.

3. **Le plan de preuves lui-même.** Aujourd'hui `computeChangeImpact` rend un
   plan d'impact, pas un plan de vérification. Il manque le tri par risque et
   irréversibilité, l'élargissement sur impact inconnu, et le déclenchement des
   niveaux édition, commit, push et main.

## Relation avec SG02.3

`SG02.3` porte déjà la formulation : « Plan adressable impactedNodes/invariants/
tests/jobs, tri stable et cache par digest ». La direction de vérification
adaptative est donc une redécouverte de cette tâche, pas une extension. La sonde
en précise les trois manques au lieu d'ajouter une tâche concurrente.

Aucune implémentation n'est revendiquée par cette preuve.
