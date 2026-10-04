# Go et Zen, preuves du contrôleur

Go opencode-go/gpt-6-luna : transport-ok via BinaryModelAdapter, aucun outil natif, 4.97 secondes, usage déclaré 9610 tokens et coût 0.001210925. Zen opencode/gpt-6-luna : plafond 55 secondes, absence de réponse. Aucun secret lu, aucun changement de préférences.

Paquet installé localement depuis cuesheet-0.1.0.tgz. Pilote PTY corrigé pour drainer les rendus avant les frappes ; deux soumissions non transmises sont conservées. La troisième session t-84c72b51-e819-40df-8e1c-7cead9ea075d sélectionne Cuesheet dans la palette. Le workspace est alloué et une modification réelle de StatusBar.tsx est exécutée par Cuesheet dans le conteneur. Dix inspections Git échouent car le fichier .git pointe hors du périmètre monté. Limite 24 étapes atteinte, objectif ouvert.

Le check propriétaire épinglé utilise l’image sha256:358569078158e76f822a2cd0ed86c440f2244a65ab1385362ab5d29d2d28ceb4, copie protégée et vrai rendu Ink. Baseline REJECTED, 3 pass et 2 fail. Candidat VERIFIED, 5 pass. Reprise du même journal et workspace avec opencode-go/kimi-k2.7-code : lecture confirmée, deuxième inférence expirée à 300 secondes. Aucun replay de l’édition.

Codex reprend directement, conformément à la directive utilisateur. Plan d’intégration du paquet installé : un seul fichier attendu, candidat vérifié avant application, source vérifiée après. controller-integration.json conserve les digests, receipts et records. Ceci ne ferme pas le goal terminal ni le parent selfhost autonome.

Défaut Git corrigé directement dans le worktree contrôleur : le vocabulaire conteneur d’un worktree lié retire git et sa politique expose la raison. Pas de montage Git host ni d’exécuteur host ajouté. Vérification ciblée : 18 pass, zéro fail, un skip Docker sans environnement dans ce lancement. Build PASS avec les 32 diagnostics TypeScript hérités inchangés. Suite complète Docker activé en cours. Contrôle initial du nouveau test corrigé de 126 vers le refus standard 127 ; échec conservé dans les sorties de session.

IntentLane : aucun changement de frontière ; machine vérifiée, Gate 4 humain en attente. Aucun événement Siri ou Spotlight inventé.

Suite finale : full-after-git-vocabulary-final.log, 1009/1006/0/3, exit 0. Source principale : HEAD 78308fe32c3560df779d73cad6471fc45b4e8f83 et index conservés. Correctif Git et test UI intégrés après comparaison exacte des octets antérieurs. Reproduction installée toujours en vérification ; ne pas présenter les retries comme un goal fermé.

Rapport canonique du contrôleur : /Users/memo/projects/_reports/cuesheet-intentlane-supervision-2026-10-02/go-zen-transport

2026-10-03 : retest machine VERIFIED. Session t-007fe57e-cfb6-4fcf-ac36-d3bce9974819 ; Go/Luna réalise l’édition, reprise du même journal avec Go/GLM-5.3, 7 étapes de reprise. Validation publique4/4, intégration contrôleur un fichier, deux checks propriétaires candidat/source5/5. But fermé sur work_verified VERIFIED. Audit indépendant :19 containers tous removed, zéro appel Git, HEAD/index de la copie source conservés, composant final identique au dépôt principal vérifié. Rapports installed-retest-audit.json et model-usage-metadata.json. Ce parcours reste séquentiel ; aucune acceptation multiworker installé ou steering sémantique déduite.
