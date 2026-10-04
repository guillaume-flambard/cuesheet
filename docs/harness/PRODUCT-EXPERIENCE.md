# Cuesheet : penser, créer, examiner, reprendre

Statut global : IMPLEMENTING. Source canonique de la nouvelle demande du 03/10/2026. Ce document relie les masters, les specs existantes et les nouveaux parcours ; il ne remplace ni leurs droits ni leurs critères de preuve. Les 44 concepts restent indexés dans MASTER-PRODUCT-DIRECTION.md. Recherche complémentaire : UX-PRODUCT-TRENDS-2026.md et UX-INTERVENTION-RESEARCH.md.

## Intention et définition de réussite

Une personne exprime un résultat souhaité et poursuit son travail dans la même surface. Elle voit ce que Cuesheet a compris, ce qui change et ce qui reste incertain. Elle peut désigner un élément précis et le corriger sans réécrire son contexte. Les agents organisent et exécutent le travail autorisé ; les résultats se consultent avec leurs sources et leurs limites. La reprise conserve intention, contraintes, effets et preuves.

Le produit est complet lorsque le parcours intention -> organisation -> équipe -> création isolée -> vérification -> intégration -> reprise est exécutable dans Cuesheet, avec entraide et choix du modèle autorisés, sans perte des fichiers existants. Une inspection ou un compteur de tests ne remplit pas cette définition.

Hors périmètre de livraison immédiate : réécriture Rust/Tauri, mesh de machines, marketplace, publication externe automatique. Les fonctions déjà spécifiées ne sont pas réinventées. L'entraide universelle reste AR-T01..07 ; elle n'est pas déclarée acquise par ce nouveau dossier.

## Modèle produit et système

Objets humains : intention, contrainte, travail, découverte, décision, contribution, preuve. Les agents sont des acteurs du travail ; les modèles sont leurs capacités. Chaque objet adressable porte ID stable, source, révision, intention/révision, état et qualification. Une source observable prouve l'existence du record, pas la vérité de son texte.

Flux : saisie ou objet sélectionné -> contrôleur -> journal durable -> objectif/directive -> contexte borné -> modèle/outils autorisés -> reçus -> projections communes -> vue humaine. Le journal demeure canonique. Les vues ne lisent pas le disque, ne décident pas des permissions et ne changent jamais les fichiers par sélection.

Systèmes réutilisés : objectives.ts (contrat humain), work-plans.ts (plan proposé versionné), agent-consultation.ts et agent-assistance.ts (consultations et liens), terminal-code-workers.ts (isolation et contributions), shared-context.ts (capsule), journaux TerminalSession (reprise), Changes (revue et intégration), model-binding/agent-models (routes humaines), WorkSurface/Timeline/Work (projection et navigation).

## Tous les parcours fonctionnels

| Parcours | Comportement et erreurs | Contrat canonique / travail restant |
| --- | --- | --- |
| Commencer | Une intention suffit ; aucun choix de mode ou projet obligatoire. Ambiguïté de scope réellement bloquante rendue explicite. | MASTER 2..5, objectifs, DD03, PM01..05 |
| Comprendre | Intention humaine distincte de l'interprétation modèle ; contraintes, exclusions, critères, raison et plan inspectables. Plan périmé retiré du présent mais conservé dans le journal. | PX01..02, IR01..04 |
| Créer | Travail décomposé avec résultat attendu et dépendances. Agent et modèle distincts. Changements de code isolés, document/skill attribué à une source. | Work plans, MULTI-WORKER, PX02, H06 |
| Demander de l'aide | Tout rôle peut exprimer besoin et limites ; admission bornée ; résultat sourcé ; aucun texte de pair ne devient une autorisation. | AR01..03, AR-T01..03 |
| Choisir le modèle | Héritage ou route humaine visible ; choix adaptatif motivé seulement parmi capacités autorisées et disponibles ; quota garde le travail ouvert. | AR04, AR-T04, H07 |
| Corriger | Désigner l'objet, conserver son brouillon, écrire la correction. Source/révision validées à l'envoi. Si l'objet change, refus explicite, brouillon intact, relecture proposée. | PX03 ; correction globale existante, réconciliation sélective H06.4 |
| Suivre | Progression sémantique, attente connue, données utiles. Aucun faux pourcentage ni raisonnement privé ; détails volontaires. | PX04, HUMAN-LEGIBILITY |
| Examiner | Proposition, effet exécuté, contribution et vérification distincts. Ouvrir Changes pour la revue ; sélection seule sans effet. | PX02, Changes, H10 |
| Apprendre | Découverte et correction rejoignent l'état commun avec origine/fraîcheur ; distribution pertinente et attestée, pas broadcast des chats. | AR05, AR-T05, shared context |
| Arrêter / reprendre | Annulation conserve reçus ; redémarrage ne relance rien automatiquement ; effet incertain exige inspection ; même intention corrigeable. | H06.9, terminal sessions, PX05 |
| Retrouver | Inspection temporaire conserve position, cible et brouillon ; historique des intentions/résultats, pas nouveaux modes. | INTERACTIVE-WORK, PX05 |

## Spécification UX/UI

Une surface terminal qui prend la densité du travail. Couleur selon sens, police monospace de l'utilisateur, ligne de lecture plafonnée à 96 cellules. Palette existante : texte #D6DBE4, secondaire #B5BECD, discret #A0AABA, activité #74A8FC, établi #7DD3C0, échec #E06C75. Ne pas réintroduire des colonnes fixes ou des cartes. Les glyphes et labels portent le sens sans dépendre de la couleur.

La singularité utile : la saisie peut viser un objet exact. Dans Work, F attache une référence à la prochaine instruction ; la ligne au-dessus de la saisie rappelle la cible. Échap enlève la référence, sans effacer le texte. La référence non envoyée est temporaire et détachée au changement de session ou au redémarrage ; une référence envoyée reste dans la directive durable. Entrée corrige le travail courant ; les routes et droits restent ceux du contrôleur. Un objet périmé ne peut pas être substitué silencieusement.

Vue de travail : intention -> compréhension/critères -> étapes proposées -> agents -> contributions -> vérification. Une seule liste parcourable, détails à Entrée. Filtres locaux 1 All, 2 Work, 3 Results ; aucun mode d'exécution. Ordre stable dans chaque famille ; sélection par ID. Flèches et PgUp/PgDown restent opérants pendant les mises à jour. Les détails ont la source et la portée de ce qui est attesté. D Changes, M Models, C Context, L Log, R retour saisie restent accessibles.

Au premier plan : intention, correction importante, blocage, puis activité. Si l'espace manque, détails agents/modèles cèdent. À 80x24, la correction et l'objet ciblé restent lisibles. Aux grandes tailles, les résultats et critères se développent ; pas de télémétrie inventée pour remplir l'écran. Les mises à jour n'arrachent pas la position de lecture.

Motion : conserver SPAWN/ROUTE/SETTLE bornés, option reduced motion ; une transition correspond à un changement réel. Pas de shimmer global ou de boucle animée pour faire croire à une progression. La frappe ne dépend d'aucune animation.

Retours immédiats : la cible se voit dès sa sélection ; au dépôt durable, la correction apparaît dans le flux. Attente du prochain point sûr ne signifie pas interruption instantanée d'un effet déjà lancé. Un résultat ancien n'est pas une preuve actuelle. Aucun undo global promis : revue et intégration utilisent les garanties réelles de Changes.

## Exigences de la livraison PX et acceptation

PX01 : une intention expose original, interprétation qualifiée, contraintes, exclusions, critères, statut et corrections depuis le journal. AC01 : créer/describe/correct/rejouer conserve original et sources, filtre un ancien plan. Test projection.

PX02 : plan et résultats sont des objets adressables : expected/dependencies des tâches, aide/modèle des agents, statut d'intégration des contributions, vérification enregistrée liée au contrat exact. AC02 : proposition et exit 0 ne deviennent jamais preuve ; journal ancien et vide restent lisibles ; aucune relation supposée. Tests de contrats/projection et rendu.

PX03 : F attache un objet actuel à l'instruction sans remplacer le brouillon ; l'envoi valide identité, source et révision de l'objectif. AC03 : cible changée ou objectif corrigé -> refus sans effet ni perte du brouillon ; source actuelle -> directive persistée puis correction existante ; restart lit la référence dans la directive. Tests intégration contrôleur et UI.

PX04 : le flux courant conserve correction/critère utiles ; Work permet filtrage, détails, sources et retour ; guides reflètent le focus réel. AC04 : quatre tailles, résultats longs, Unicode, croissance, frappe et mouvement réduit ; aucun affichage d'Entrée send pendant une inspection. Tests interaction/rendu et PTY installé.

PX05 : annulation de référence, retour des vues secondaires et nouvelle histoire isolent leurs états ; les sources anciennes restent historiques. AC05 : Esc détache, texte intact ; changement de session nettoie référence ; reprise sans réexécution passive ; régressions sessions/steering. Tests et inspection adversariale.

## Graphe fini et dépendances

| TODO | Prio | État | Contenu / preuve attendue |
| --- | --- | --- | --- |
| PX-T01 | P1 | DONE | Recherche primaire, spécification complète des parcours et limites ; sources et mapping ci-dessus |
| PX-T02 | P0 | DONE | Projection des objets PX01/02 ; dépend T01 ; projection sur événements réels contrôlés |
| PX-T03 | P0 | DONE | Référence de correction validée/persistée PX03 ; dépend T02 ; stale, refus, succès, reprise |
| PX-T04 | P1 | DONE | Work filtrable, référence dans la saisie, guide de focus et densité PX04/05 ; dépend T02/03 ; interactions |
| PX-T06 | P0 | DONE | Défauts découverts : saisie locale vidée après envoi refusé, Échap effaçant le brouillon ciblé ; PX03/05 ; interaction refus puis frappe et détachement |
| PX-T05 | P1 | DONE | Vérification indépendante et parcours installé ; dépend T02..04 et T06 ; build, captures, preuves |

Le graphe produit global reste fini dans state.json et les specs parentes. PX ne ferme pas AR, IR, PM, AE ou H06. Les nouvelles tendances ne créent pas de fonctionnalités gratuites ou non vérifiées. La phrase de complétion globale ci-dessus reste non satisfaite tant que ces contrats P0/P1 restent ouverts.

## Couverture, risques et exploitation

APPLICABLE : core/UX/loading/empty/error/cancel/retry/persistence/integrity/restoration/concurrency/idempotency/authorization/privacy/security/accessibility/performance/offline/cache/backward compatibility/API/logging/diagnostics/testability/unit/integration/end-to-end/build/packaging/rollback/docs/devex. Projection pure et cache par révision, aucune nouvelle requête pour inspecter. Faits immuables ; référence périmée refusée ; draft conservé ; pas de permission par contenu. Les corrections peuvent contenir des données privées : mêmes journaux locaux, aucune copie analytique.

N/A à PX : nouvelle authentification, intégration réseau, métriques distantes, migration des données, déploiement serveur, migration utilisateur et suppression de fichiers. Le réseau fournisseur existant n'est utilisé qu'après instruction humaine, avec limites existantes. Pas de nouvelle dépendance ni changement du modèle par défaut.

R-PX01 HIGH : traiter une proposition comme preuve. Mitigation séparation de types, source et contrat exact, test hostile ; MITIGATED après EV-PX02/03 et revue EV-PX05.
R-PX02 HIGH : correction vers mauvaise cible après changement. Mitigation validation finale source/objectif, brouillon conservé ; MITIGATED après EV-PX02/03 et revue EV-PX05.
R-PX03 HIGH : introduire une seconde vérité ou rejouer un effet lors de lecture. Mitigation projection passive et journaux existants ; MITIGATED après EV-PX02/03 et revue EV-PX05.
R-PX04 MEDIUM : focus ambigu / hauteur dépassée. Mitigation guide adapté, budget partagé et quatre tailles ; MITIGATED après EV-PX02/03 et revue EV-PX05.

Plan de vérification : contrats de projection -> correction sur vrai contrôleur avec modèle contrôlé -> interactions clavier complètes -> régressions affectées -> build -> PTY du binaire installé avec journal d'essai peuplé, capture inspectée -> revue indépendante cherchant défauts. Aucune preuve fournisseur réelle déduite d'un modèle contrôlé. Le nombre de tests n'est pas une mesure de qualité produit.

Limite de fraîcheur : Work projette les vérifications enregistrées sous le contrat courant. Une modification de fichiers hors du journal peut les rendre historiques sans notification immédiate ; le détail demande un nouveau check et ne certifie pas le disque courant. Le check indépendant et Changes demeurent les autorités pour agir.

## Preuves de la livraison PX

EV-PX01 (PX-T01) : synthèse UX-PRODUCT-TRENDS-2026.md, sept sources officielles, assertions distinguées des décisions Cuesheet ; masters lus, parcours et dépendances spécifiés ici avant code. Toute la vision conserve ses critères parents ouverts.

EV-PX02 (PX-T02/03, AC01/02/03/05) : 28 tests PASS dans work-objects, work-surface, agent-assistance, agent-consultation, terminal-sessions. Projection original/interprétation/critères/spec ; cible exacte refusée après correction ; vrai contrôleur pendant inférence suspendue ; référence, instruction et source conservées dans TerminalSession après fermeture/réouverture passive ; refus disque et interruption vérifiés. Modèles contrôlés, pas de nouvelle preuve fournisseur.

EV-PX03 (PX-T04/06, AC03/04/05) : 31 tests PASS dans product-experience-ui, mid-run-directive, ui-exactly-once, mac-commands-motion. Refus d'envoi puis frappe conserve le brouillon, Échap détache sans effacer, envoi accepté transmet la bonne référence, filtres opérationnels, focus annoncé, quatre tailles. Après les derniers ajustements : 5/5 PASS pour product-experience-ui, interactive-work-ui, live-work-render, terminal-session-ui. Intention et correction restent visibles pendant activité. Build PASS, zéro erreur TypeScript ; diff --check PASS.

EV-PX04 (PX-T05, AC04/05) : terminal installé lancé sous PTY, session contrôlée t-ac401bda-e4a1-4f1b-bb13-6694f751a53b, sans appel fournisseur ni modification de code par le produit. Navigation liste -> intention détaillée -> F cible -> Échap détache, brouillon conservé ; filtre Results ; resize aux quatre tailles. Captures dans /Users/memo/projects/_reports/cuesheet-redesign-2026-10-03 : px-objects-120.png, px-intent-detail-120.png, px-target-120.png, px-detached-120.png, px-objects-80.png, px-results-80.png, px-results-160.png, px-results-240.png. Le détail 120 a été inspecté visuellement ; les captures viennent du binaire réel avec données explicitement qualifiées d'exemple, pas d'une maquette web.

EV-PX05 (PX-T05) : revue indépendante read-only px_verify. P1 trouvé : tampon d'édition vidé avant réponse du contrôleur ; corrigé et reproduit dans EV-PX03. Deuxième passage : aucun autre P0/P1 établi ; source/révision/contrat de vérification inspectés. Limite conservée : une projection de journal ne détecte pas une modification externe du disque. Agents historiques sans rattachement exclus du travail courant ; ils restent au journal et à l'inspection agents.

État PX : READY_FOR_MANUAL_ACCEPTANCE. P0/P1 de PX ouverts : 0 ; AC01..05 vérifiés par les preuves ci-dessus ; risques hauts PX mitigés. Acceptation esthétique non reçue. Produit global : IMPLEMENTING, AR/IR/PM/AE/H06 restent ouverts selon state.json. Ce statut ne vaut ni autonomie universelle ni validation utilisateur du produit entier.
 Acceptation humaine : juger la facilité à comprendre, désigner, corriger et reprendre dans la surface installée. État final PX au maximum READY_FOR_MANUAL_ACCEPTANCE, produit global IMPLEMENTING.
