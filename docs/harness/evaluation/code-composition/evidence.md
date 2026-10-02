# EV-CODE-COMPOSITION

2026-10-02 H06.3c2a et preuve dédiée H06.2c2.

14 tests ciblés PASS : `/tmp/cuesheet-code-composition-targeted.log`. Deux workers producer/Shell réels, deltas disjoints composés puis check owner et application source récupérable, finish vérifie source avant goal fermé. Fichier humain dirty/index préservés, scopes réels hors paquet, source drift, check rejeté et journal privé incertain refusés sans delta source. Conflit de deux vrais worktrees refusé avant toute copie dans composition.

1 Docker test réel PASS : `/tmp/cuesheet-private-container-targeted.log`. Même factory production exportée utilisée par runtime ; intent parent avec scope enfant ne peut admettre un effet privé. Les deux enfants ont leurs intents/journaux/receipts et fichiers séparés, ressources owned status removed ; aucune ressource ajoutée au parent. Image existante immutable, aucun pull/push.

893 tests/891PASS/0fail/2 skips existants,118.7s : `/tmp/cuesheet-code-composition-full.log`. Oracle indépendant et vrai build worktree Linux inclus. Build final séquentiel PASS32 diagnostics hérités : `/tmp/cuesheet-code-composition-build.log`. Diff check PASS. Revue solo adversariale : responsabilités prises depuis admission owner, chemins/journaux recalculés, journaux claim avant lecture, tous les deltas calculés contre même source ; union exacte bornée ; fichiers composition remplacés via temporaire plutôt que tronqués (hardlinks) ; check composition et plan revalidés avant apply ; partial apply retourne null ; finish/source reste distinct. Ancien contrat refuse dès sélection du batch/revision (inspection), correction directe couverte par tests producer.

Limites : pas de provider LLM réel validé, modèle fixture ; récupération après crash et cleanup/quota encore ouverts. Allocation/composition refusée ou check rejeté restent préservés ; pas de restauration/retry aveugle. Pas de CAS kernel contre éditeur externe. H06.3c2a DONE borné et H06.2c2 DONE borné ; parents H06.2/3/4/5 et global IMPLEMENTING restent ouverts.
