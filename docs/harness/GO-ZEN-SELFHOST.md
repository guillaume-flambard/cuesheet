# Parcours installé Go et Zen

Owner 2026-10-02 : utiliser OpenCode Go et Zen comme transports. Codex garde la responsabilité de la revue, des effets et de la vérification.

Modèle du parcours : terminal installé -> BinaryModelAdapter sans outils natifs -> proposition JSON -> contrôleur et journal -> workspace isolé incluant la source dirty -> effets conteneur -> check propriétaire épinglé -> intégration -> check source indépendant.

REQ-GZ01 : route explicite opencode-go/gpt-6-luna, sans écriture de préférences ni lecture de secrets. Zen est essayé séparément avec plafond de 55 secondes. AC-GZ01 : Go renvoie transport-ok et zéro appel ; échec Zen conservé avec durée et absence de résultat.
REQ-GZ02 : améliorer StatusBar.tsx uniquement. Les compteurs positifs lecture, modification, notification et échec lisent naturellement en français au singulier et pluriel ; zéro reste absent, busy et aide restent utilisables. AC-GZ02 : rendu réel des états 0, 1, 2 et busy via test propriétaire.
REQ-GZ03 : parcours réel installé, vrai modèle, workspace isolé, check épinglé avant exécution et integration vérifiée. AC-GZ03 : journal durable, effet réel, check candidat puis source, absence de changements hors périmètre et HEAD/index conservés.

Graphe fini : GZ-ROUTE VERIFIED par les fichiers du rapport go-zen-transport ; GZ-PLAN VERIFIED par ce document ; GZ-RUN VERIFIED dépend de GZ-PLAN ; GZ-REVIEW VERIFIED dépend de GZ-RUN ; GZ-PROVE VERIFIED dépend de GZ-REVIEW. Aucun parent H06.5c/H10.4 ne ferme sur ce seul parcours.

Risques : coût modèle et contexte mesurés ; plafond du driver et journaux conservés ; échec fournisseur ne devient pas réussite. Le contrôleur refuse les effets source avant isolation. Aucune clé dans les preuves. Périmètre runtime/UI/erreurs/reprise/concurrence/integrité/package/auth applicable via garanties existantes et journal. Migration, déploiement externe, cache et nouvelle API N/A car modification de libellés seulement. Vérification : rendu propriétaire épinglé, diff borné, tests UI pertinents, diff check ; reprise et correction sémantique restent des critères distincts ouverts.

Statut IMPLEMENTING. Aucun résultat qualité anticipé.


Défaut GZ-GIT découvert dans le parcours réel : le conteneur annonce git dans un worktree dont .git est un fichier pointant vers des métadonnées host non montées. Dix inspections échouent et le modèle épuise son budget. REQ-GZ04 : pour cette route, retirer git du vocabulaire et refuser son exécution avant création de ressource ; conserver git pour un dépôt à métadonnées locales et pour la route locale. AC-GZ04 : tests de vocabulaire et refus sans socket utilisable, plus compatibilité dépôt et route locale. GZ-GIT-FIX P1 IN_PROGRESS -> GZ-GIT-VERIFY P1 PENDING. Ce changement ne monte pas de métadonnées host et ne crée aucun exécuteur host supplémentaire. Risque : détection conservatrice du fichier .git ; contrôleur Git et intégration restent disponibles. Vérification runtime autonome complète et correction sémantique toujours ouvertes.


2026-10-03, preuves : GZ-COUNT-DIRECT et GZ-GIT-FIX machine VERIFIED. Candidat et source passent les cinq rendus propriétaires. Suite complète finale : 1009 tests, 1006 pass, zéro fail, trois skips fournisseur. L’assertion UI historique notification(s) a été remplacée par le singulier réel et son absence de placeholder, puis les contrôles imbriqués relancés. Aucun nouveau diagnostic de build.

GZ-RETEST suit la reproduction décrite dans le rapport NEXT-INSTALLED-RUN.md : copie dirty isolée, seul StatusBar de la copie remet sa version HEAD anglaise en précondition. Le dépôt principal reste français et vérifié. Un essai avec HOME de test a perdu l’accès provider dans le lancement du terminal ; échec de montage d’environnement, aucune clé changée, route corrigée en reprenant l’environnement utilisateur. Le but naturel est résolu dans le répertoire de reproduction avant le lancement. Go/Luna refait l’édition sans Git invalide mais boucle sur l’historique ; même session reprise avec Go/GLM-5.3 et budget de contexte 96000 caractères. Résultat encore PENDING à cette écriture. Les échecs restent conservés ; aucune clôture H06.5c/H10.4 ni acceptation humaine.

2026-10-03 : retest machine VERIFIED. Session t-007fe57e-cfb6-4fcf-ac36-d3bce9974819 ; Go/Luna réalise l’édition, reprise du même journal avec Go/GLM-5.3, 7 étapes de reprise. Validation publique4/4, intégration contrôleur un fichier, deux checks propriétaires candidat/source5/5. But fermé sur work_verified VERIFIED. Audit indépendant :19 containers tous removed, zéro appel Git, HEAD/index de la copie source conservés, composant final identique au dépôt principal vérifié. Rapports installed-retest-audit.json et model-usage-metadata.json. Ce parcours reste séquentiel ; aucune acceptation multiworker installé ou steering sémantique déduite.
