# P1: relecture et arrêt sûr sur effet non réconcilié — 12 octobre 2026

Statut : candidat de PR `fix/core-orphan-guard-20261012`, tests et intégration soumis à CI, pas une restauration complète automatique.

## Défaut

Le noyau générique publie maintenant un `action` AVANT chaque outil (PR #13), mais une nouvelle invocation de `runAgentLoop` sur la même session pouvait encore retenter les commandes après un crash survenu avant leur réponse. Le fait que l'effet n'ait pas de réponse ne prouve pas qu'il ne s'est pas produit.

Scénario mesuré rouge avant le patch : outil externe déconnecté, `action` sans `observation` ; nouveau modèle appelé, outil répété et `budget-exhausted` au lieu de `blocked`. Autre échec : l'observation enregistrée ne portait aucun ID de l'intention répondue. Premiers tests : 2/4 en échec, reproduisant les défauts.

## Changement limité

- Un projecteur pur lit les événements dans l'ordre et recherche les `action` de l'agent sans observation terminale associée.
- Une observation avec `intentSeq` doit référencer une action antérieure du même agent, même outil et même étape. Les anciens logs sans `intentSeq` continuent à être appariés par agent/outils/étape, en ordre d'apparition.
- Une observation `exit:null` reste une réponse incertaine ; elle **n'est pas** une garantie de conclusion et ne lève pas le blocage.
- Avant admission, modèle, outil ou écriture, `runAgentLoop` renvoie `blocked` avec les numéros de séquence non réconciliés. Aucun nouvel événement n'est ajouté par cette décision.
- Les nouveaux événements d'observation référencent explicitement la séquence de la demande d'outil.

Le but est **l'absence de répétition d'un effet potentiellement exécuté**, pas d'inventer une preuve. Une vraie inspection indépendante et une observation étayée restent nécessaires avant la reprise ; `exit:0` est une observation d'outil, pas une acceptation de l'objectif.

## Preuves locales

Commande : `node --test test/core-orphan-resume.test.ts test/core-intent-before-effect.test.ts test/loop.test.ts` ; **24 tests passés, 0 échec** sur le Mac isolé. Les nouvelles fixtures couvrent le crash, la reprise sans inférence, un receipt lié, le replay ancien, un mauvais agent, un mauvais outil et la réponse `exit:null`. Les tests ciblés ne remplacent pas la CI complète sur GitHub.

## Limites et prochain jalon

- La réconciliation n'est pas automatisée ici : il faut un reçu crédible lié à l'intention exacte et au monde réellement observé ; le modèle ne peut pas décider seul de l'état de l'effet.
- La relation `subject/tool/step` dans les vieux logs reste une meilleure-effort de compatibilité, pas une preuve cryptographique ; introduire des identifiants d'action dès la création du journal dans toutes les surfaces nouvelles.
- Les `effect_requested/effect_observed` du contrôleur terminal restent des concepts distincts ; auditer leur correspondance avec ce projecteur avant de factoriser.
- Les réponses `exit:null` peuvent concerner des outils non mutateurs ; une déclaration de capacité/idempotence documentée permettra de les classer plus finement, sans fallback implicite.
- Mesurer 10k+ événements et cas concurrents, puis implémenter la réconciliation par source de vérité avec critères d'acceptation épinglés.

Références : `docs/harness/IMPLEMENTATION-GATES-2026-10.md` (P1/P2), `REFERENCE-DEEP-DIVE-2026-10.md` (LangGraph/Codex), `docs/harness/evaluation/intent-before-effect-2026-10-12.md`.
