# Travail inspectable depuis le flux

Status: READY_FOR_MANUAL_ACCEPTANCE (tranche IW uniquement). Périmètre : première tranche de rendu issue de la recherche web, sous AR-T06. L'entraide universelle et le routage adaptatif restent dans AR-T01 à AR-T07 ; aucune relation d'aide ni consommation de connaissance ne sera inventée par la vue.

Intention : comprendre l'activité courante et agir depuis une inspection temporaire, sans perdre sa saisie. Le changement est complet quand les événements et agents existants sont inspectables, leurs résultats restent qualifiés, la navigation préserve le flux et le brouillon, et le rendu est vérifié aux quatre tailles requises.

Système : journal -> projectWorkSurface / contrôles de présentation -> état -> LiveWork et Work inspection -> navigation vers Changes, Models et Shared context. Pas de nouvel effet externe ni de migration de données ; navigation éphémère. Sources : AGENT-ASSIST-VIEWS-RESEARCH.md et masters produit/design.

Exigences et acceptation :
- IW01 : Tab et /work ouvrent une liste sélectionnable d'actions et agents ; Entrée montre le détail exact, flèches et PgUp/PgDown parcourent les éléments et résultats longs. Identité sélectionnée stable pendant les mises à jour.
- IW02 : les résultats agents sont explicitement non vérifiés, les commandes réussies attestent seulement une exécution. Les modèles réels viennent de la projection du journal. Aucun lien d'entraide supposé.
- IW03 : raccourcis de l'inspection vers changements, modèles et contexte ; Échap restaure le brouillon. La position de lecture est conservée lors d'une inspection ; le flux caché ne reçoit pas de navigation.
- IW04 : activité publique depuis événements, réponse publiée distincte du raisonnement interne ; hauteur stable pendant streaming, pas de clignotement global. Afficher la cause d'attente connue, jamais une phase inventée.
- IW05 : build, régressions ciblées, interactions Ink et rendu 80x24,120x30,160x50,240x70 ; essai PTY installé pour ouverture/fermeture/saisie.

Graphe : IW-T1 P0 projection/inspection IW01/02 ; IW-T2 P0 intégration/navigation IW03 dépend T1 ; IW-T3 P1 activité IW04 ; IW-T4 P1 vérification IW05 dépend T1/2/3. Tous IN_PROGRESS ou TODO jusqu'aux preuves.

Couverture : UX, états vides/erreurs, interruption/reprise, identité, compatibilité, clavier, mouvement réduit, performance et diagnostics APPLICABLE. Réseau/auth/permissions/déploiement N/A à cette vue en lecture seule : les contrôleurs existants restent autorités. Données/sécurité : aucune nouvelle transmission, ne pas interpréter le texte des résultats comme commandes. Risques : perdre la sélection au tri, intercepter les frappes du composer, dépasser la hauteur, confondre proposition et preuve. Mitigation : IDs stables, contrôles actifs uniquement dans la vue visible, budgets de lignes, qualifications explicites et vérification par interactions.

Vérification prévue : test d'interaction avec changements d'état/texte long/brouillon ; tests existants activité, sessions, agents, commandes ; build ; PTY installé et capture. Révision adversariale finale : croissance du flux, petite taille, résultat tardif, retour après inspection et absence d'effet lors de navigation.

Preuves : pending. Acceptation manuelle esthétique : pending. Aucun critère AR fermé par cette tranche seule.

## Preuves de la tranche et limites

- 10 tests ciblés passés : interactive-work-ui, agent-ui, live-work-render, mac-commands-motion, work-surface, terminal-session-ui. Après le dernier ajustement du budget partagé agents/actions, les deux tests de rendu et d'interaction ont été rejoués : 2/2 PASS.
- Build final : PASS, zéro erreur TypeScript. git diff --check : PASS.
- Test d'interaction : agent sélectionné conservé quand un autre s'insère ; résultat long défilable ; proposition non vérifiée ; source et modèle réels dans le détail ; navigation contexte/changements ; brouillon conservé ; aucune inférence lancée par la navigation ; quatre tailles PASS.
- PTY installé : Tab ouvre Work, Échap rend le brouillon, la frappe continue, C ouvre le contexte réel. Captures inspectées : /Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/interactive-work-installed.png et interactive-work-return.png. Capture contexte : interactive-work-context.png.
- Régression trouvée puis corrigée : insertion du menu en première position changeait les raccourcis positionnels existants. Nouvelle commande placée après les commandes existantes ; reprise de session PASS.
- Pas de nouvel essai fournisseur réel dans cette tranche : l'actualisation des agents est vérifiée par événements contrôlés. Le parcours réel d'entraide universelle reste ouvert sous AR-T07.
- Le maintien de la position de lecture à travers une inspection est implémenté par maintien du Timeline monté et suspension des entrées/mesures cachées ; test adversarial dédié PASS : mêmes lignes historiques avant/après inspection, arrivée de résultat pendant fermeture, PgDown dans la vue temporaire sans modifier le flux, brouillon conservé. IW03 vérifié.

État : READY_FOR_MANUAL_ACCEPTANCE pour IW. IW-T1 à IW-T4 DONE avec les preuves ci-dessus ; IW01 à IW05 vérifiés. P0/P1 ouverts dans cette tranche : 0 ; risques hauts ouverts dans cette tranche : 0. Acceptation esthétique humaine non reçue. Cette tranche ne ferme pas AR-T06 global ni l'entraide/routage backend.

Acceptation manuelle : ouvrir Cuesheet, Tab ou /work, sélectionner un travail, Entrée pour le détail, D pour les changements ou C pour le contexte ; Échap et reprendre le brouillon. Juger la lisibilité et le confort du parcours.

## Suite UX issue de la seconde recherche web

État de la suite : READY_FOR_MANUAL_ACCEPTANCE, critères précédents conservés séparément.

Sources consultées le 03/10/2026 : [Google PAIR Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/), [Microsoft Human-AI guidelines](https://www.microsoft.com/en-us/research/?p=564561), [NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [Cursor Agent](https://cursor.com/docs/agent/overview), [OpenCode TUI](https://opencode.ai/v2/docs/cli/tui/), [Claude checkpointing](https://code.claude.com/docs/en/checkpointing). Synthèse spécialisée dans UX-INTERVENTION-RESEARCH.md.

Observations : PAIR recommande de préciser la portée et le moment d'effet du feedback ; Microsoft traite correction et récupération comme interactions essentielles ; NN/g réserve les options secondaires à un accès volontaire. Les documentations concurrentes distinguent différemment message en attente, correction et retour arrière. Les checkpoints Claude ne couvrent notamment pas tous les effets shell ou sous-agents. Ne pas promettre un undo global à partir d'un bouton.

Décisions propres à Cuesheet : garder Entrée pour corriger pendant le travail, retour en arrière de navigation sans effet sur fichiers, aide visible seulement si son lien est enregistré. Un écran secondaire doit restituer le travail sélectionné, pas ramener systématiquement au début du flux. Un travail invalidé pendant sa lecture doit être signalé, pas remplacé silencieusement par un autre.

- UX-T01 P1 DONE : navigation Work -> contexte/modèles/diff/log -> retour Work, sélection et défilement conservés ; R rend la saisie pour corriger sans modifier le brouillon. Test avec croissance et état périmé. Critère UX01.
- UX-T02 P0 DONE : avancer AR-T01 par un contrat de demande d'aide versionné, transitions contrôlées, projection sans effets et reprise explicite. Brancher les consultations existantes, identité stable et modèle/motif factuels. Critère UX02 : liens dans les vues égaux aux événements, résultats INFERRED, résultats après correction invalidés, ancienne histoire compatible. AR-T01 reste ouvert pour scheduler, distribution et tous les rôles.
- UX-T03 P1 DONE : vue Work et flux présentent le lien d'aide enregistré, question et raison de route ; aucun faux lien pour les anciens agents. Critère UX03, dépend T02.
- UX-T04 P1 DONE : build, contrats, régression consultations, navigation clavier et rendu quatre tailles, PTY installé ; preuves distinctes fournisseur réel/simulation. Critère UX04, dépend T01 à T03.

Couverture complémentaire : schéma additif sans migration ; source de vérité journal existant ; aucun élargissement des permissions ni transmission nouvelle ; même nombre d'inférences ; erreur d'écriture bloque l'inférence suivante ; résultat tardif après invalidation ne ressuscite pas une aide. Risques hauts : fausse relation d'aide ou faux succès après correction, sélection réaffectée sans annonce. Vérification : machine de transitions, ancien journal, invalidation après réponse, clavier pendant croissance. Réseau, achat et déploiement : N/A pour cette tranche. L'entraide récursive, le scheduler universel, le routage adaptatif et la redistribution inter-session restent explicitement sous AR-T02 à AR-T07.


### Preuves UX01 à UX04, 03/10/2026

- 32 tests ciblés PASS : assistance, consultations, routage existant, skills, projection, interaction, rendu et commandes/mouvement. Après enrichissement du scénario adversarial : interactive-work-ui, terminal-session-ui et agent-ui, 4/4 PASS.
- UX01 : retour contexte vers Work, sélection conservée malgré insertion, R vers brouillon intact, reprise de frappe, historique conservé. Disparition du travail sélectionné : dernier détail conservé avec « No longer current », sans substitution silencieuse. Quatre dimensions vérifiées.
- UX02 : demandes versionnées et transitions durables ; consultation réelle du contrôleur sous modèle de test : même nombre d'inférences, demandeur/modèle/motif/sources attribués. Journal ancien sans lien inventé. Correction tardive invalide le résultat ; écriture refusée avant admission empêche tout appel fournisseur ; reprise passive marque les aides inachevées interrompues.
- UX03 : lien « helping main task » dans le flux, raison du modèle dans le détail, test d'interaction PASS. Motif hérité ou configuration humaine seulement, aucun routage adaptatif prétendu.
- UX04 : build PASS, zéro erreur TypeScript ; diff --check PASS. Terminal installé via PTY : Work -> C contexte -> Échap Work -> R saisie -> frappe, brouillon « ma correction! » conservé. Captures : /Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/ux-work-back.png (inspectée visuellement), ux-work-context.png et ux-work-composer.png. Ce parcours PTY ne lance aucun modèle ; les relations peuplées sont vérifiées par tests contrôlés, pas par une session fournisseur réelle.
- Revue adverse : entrées des vues cachées neutralisées, retour de session réinitialisé, résultats périmés non ressuscités, aucune inférence déclenchée par navigation. Les deux ajustements du test reflètent le nouveau retour vers Work et les lignes supplémentaires du détail ; les assertions sur la dernière page et le brouillon restent vérifiées.

P0/P1 ouverts dans cette tranche bornée : 0 ; risques hauts de cette tranche : 0 après vérification. Acceptation esthétique humaine toujours attendue. AR-T01 reste IN_PROGRESS : le contrat ajouté couvre les consultations existantes, pas encore budget, profondeur, scheduler universel et distribution. AR-T02 à AR-T07 restent ouverts.
