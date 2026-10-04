# Développement quotidien avec agents de code

Périmètre autorisé : poursuivre le parcours Cuesheet développe Cuesheet avec
le modèle configuré, des unités indépendantes et des contributions récupérables.
La première livraison DAILY-USE reste en attente d’acceptation humaine.

## Exigences et critères

MA01 : chaque agent de code dispose de check_types sur sa copie isolée,
avec les dépendances installées du projet propriétaire, sans script ni installation.
Le test doit détecter une erreur présente seulement dans la copie de l’agent.
MA02 : les autres outils gardent leur exécuteur et leur signal d’arrêt.
MA03 : deux agents réels lancés depuis le terminal produisent des contributions
sur des fichiers distincts, visibles et consultables sans perte après reprise.
MA04 : une décision humaine porte sur le diff exact, conservant les changements
antérieurs ; une contribution périmée ou conflictuelle ne peut être appliquée.

## Graphe fini

- MA-T01 DONE : donner check_types aux agents et vérifier MA01/MA02.
- MA-T02 DONE, dépend MA-T01 : relier les contributions à la revue humaine MA04.
- MA-T03 IN_PROGRESS, dépend MA-T02 : exercer MA03/MA04 dans le terminal installé.

## Risques et vérification

Le compilateur doit lire les sources isolées et refuser les chemins sortants.
La compilation réussie ne valide pas l’objectif ni le rendu.
Les contributions terminées sont maintenant accessibles par /changes.
Le parcours complet avec deux réponses provider Flash reste à vérifier.
Vérifier le compilateur réel, le routage des autres outils et les deux projets TS,
puis le terminal réel pour MA-T03. Conserver les journaux et copies privées.

## Preuves du 2026-10-03

15 tests ciblés passent : test/static-typecheck.test.ts et
 test/code-worker-loop.test.ts. Build : zéro erreur TypeScript.
Le compilateur réel lit une erreur propre à la copie isolée et conserve l’original.

Essai réel installé, modèle opencode-go/deepseek-v4.1-flash :
/Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/sessions-1791039903433
Deux agents admis simultanément, événements parent 29 et 31.
ui-reviewer : fichier créé via node (journal privé
 t-178478fe-8864-4d56-805f-7ada327907db, observation 3), check_types réussi
(observation 6 : 33 fichiers, aucune émission), proposition parent 33.
safety-reviewer : échec dès la première inférence, aucun effet observé,
publication parent 35. Le parcours à deux résultats reste NON VÉRIFIÉ.
Les copies et journaux sont conservés ; aucune intégration demandée ou effectuée.
Capture réelle daily-workers-v2-finished.png dans le même répertoire de rapports.

Premier essai conservé dans sessions-1791039822456 : découverte trop large,
échec sur dossier absent et budget épuisé. Le budget et les raisons d’échec
sont maintenant explicités dans le contrat worker. La cause précise du second
échec n’est pas établie ; les anciennes publications sans texte restent historiques.

Statut : IMPLEMENTING. MA01/MA02 vérifiés ; MA03/MA04 ouverts.

## Suite : revue humaine des contributions

MA-T02 P0 DONE : /changes compose les deltas de tous les agents du lot
courant terminé. La revue affiche les vrais fichiers, puis a/Enter applique le
diff affiché au scope source du lot, r/Enter conserve les copies et écarte le lot.
MA-T04 P1 DONE : un lot incomplet, un journal incertain, un fichier hors du
paquet, une révision changée ou une dérive source refuse la composition.
MA-T05 P1 DONE : tester composition, décision, répétition, dérive et reprise.
La fermeture de l’objectif reste indépendante de la décision humaine.

Flux : commande Changes > producteur > journaux parents/privés > plans attestés
par agent > copie composée possédée > WorktreeReview > reçu humain > intégration
récupérable existante > état partagé. Les décisions ne deviennent pas des outils
modèle. La copie composée reste sur disque après arrêt/reprise, sans rejouer les
effets des agents. Une actualisation peut allouer une nouvelle copie composée.
Les contrôles d’appartenance, scope, provenance et effets incertains restent
obligatoires. Les fichiers existants et l’index Git sont préservés par le plan.

Risques élevés à vérifier avant clôture : lot partiel accepté à tort, source
modifiée pendant revue, décision après correction, preuve privée absente.
Compatibilité : nouveaux événements additifs ; anciens lots restent inspectables.
Réseau/auth/provider inchangés, aucun déploiement externe ni migration.
Performance bornée par les limites d’intégration existantes, deux agents maximum.
Accessibilité/états chargement/confirmation réutilisent l’overlay Changes existant.

MA-T06 P1 DONE, défaut observé : limiter chaque inférence d’agent à
60 secondes, annuler son appel provider et enregistrer un échec explicite.
Le journal et les effets terminés restent conservés, sans rejeu.
MA-T07 P1 DONE, récupération nécessaire : un lot terminé mais incomplet
ou périmé donne une revue bloquée, uniquement r/Enter pour écarter en conservant
les copies. Aucun diff partiel n’est appliqué. Une incertitude d’intégration
source exige toujours une inspection des reçus avant nouveau travail.

## Preuves de la revue livrée

EV-MA-REVIEW : 46 tests ciblés passent, commande :
node --test test/terminal-code-workers.test.ts test/code-worker-loop.test.ts
 test/worktree-review.test.ts test/change-review-ui.test.ts.
Le test révision inclut une correction, puis l’écartement du vieux lot.
Le timeout annule le signal d’inférence, rejette ses appels tardifs et conserve
le reçu d’un effet antérieur terminé. Build : zéro erreur TypeScript.

EV-MA-NATIVE : terminal installé, vrais worktrees et vrais effets node dans
un dépôt temporaire. Les propositions du modèle sont des fixtures explicites,
pas des réponses Flash. /changes affiche ui.md et safety.md, n passe au second,
a seul ne modifie aucun fichier, Entrée applique les deux. Preuves exactes :
/Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/review-fixture-1791041335380/proof.json
L’index, HEAD et human.txt restent intacts ; zéro work_verified. Après réouverture,
/changes n’affiche plus de contribution ; les agents portent application humaine,
complétion non vérifiée. Captures agent-review-fixture-second.png,
agent-review-fixture-small.png, agent-review-fixture-result.png et
agent-review-fixture-restored-agents.png dans le répertoire de rapports.

EV-MA-RECOVERY : session réelle Flash sessions-1791040913452 reprise dans
l’application. /changes refuse la source périmée, r puis Entrée écartent le lot,
les copies restent présentes. Captures agent-review-blocked.png et
agent-review-rejected.png. Le lot peut être relancé après cette décision.
Dans cet essai safety-review a créé son document et check_types a passé ;
ui-review a créé son document mais sa deuxième inférence est restée en attente.
L’appel a été interrompu sans rejeu. La nouvelle tentative du coordinateur est
également restée en attente provider et a été arrêtée avant de lancer des agents.
La cause provider précise reste inconnue, aucune réussite du parcours complet
Flash n’est déclarée. Ce défaut est le MA-T03 restant, priorité P0.

Audit : décisions opaques et exactes, aucune autorité modèle nouvelle,
lots partiels/hors scope/périmés uniquement écartables, copies privées conservées.
Revue humaine vérifiée ; état global de cette tranche : IMPLEMENTING.
MA04 VERIFIED. MA03 FAILED, attente provider à diagnostiquer.
Acceptation humaine non reçue. Essai utile : /changes, n/p, a puis Entrée ou
r puis Entrée, réouvrir et vérifier le résultat et l’état Agents.

EV-MA-UNCERTAIN : reçu privé incertain, application refusée, écartement conserve
les copies et le source. Test human agent review uncertain-receipt : PASS.

## Défaut fournisseur identifié

EV-MA-PROVIDER : probe-events.mjs, demande triviale sans outil, serveur possédé.
Le SSE émet session.status busy puis retry attempt 1, classification quota,
à environ 3 secondes. Le contrôleur ignorait cet événement et attendait le POST
jusqu’au timeout. Les transports CLI et HTTP ont attendu 30 secondes sans réponse.
Aucun contenu de réponse fournisseur ni credential n’est imprimé par les probes.

MA-T08 P0 DONE : reconnaître les événements retry/error du serveur pour
la session possédée, interrompre la requête dès le refus, expliquer quota/auth/
rate-limit/erreur transitoire avec une formulation contrôlée et permettre la
sélection de modèle existante. Aucun fallback automatique ni changement du
modèle par défaut. Le modèle principal et les agents de code utilisent le même
transport observable ; le second ne doit plus masquer les retries CLI.
Critères : événements d’une autre session ignorés, pas de réponse/effet après
refus, texte d’erreur arbitraire et credentials non affichés, annulation serveur,
restauration et correction inchangées. Un quota externe ne peut être réparé par
le contrôleur ; une requête Flash ne devient pas réussie par changement de modèle.
Vérifier transport SSE simulé, loop workers, sélection, build et erreur dans le
terminal réel. La réussite de deux agents Flash reste conditionnée au quota.

## Correction du quota : preuve et reste à faire

EV-MA-QUOTA-FAST : session installée réelle
/Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/sessions-1791042331180/t-51f81aa8-78e1-4a4f-8edc-866159b468e3.jsonl.
RunAgent demandé #16 à 1791042343431, échec observé #22 à 1791042346864 :
3433 ms. Zéro terminal.intent, aucune action outil acceptée. L’interface affiche
le quota en français, la saisie fonctionne, Ctrl+P ouvre le choix des modèles,
Esc conserve le brouillon. Captures provider-quota-fr.png,
provider-quota-fr-models.png et provider-quota-draft-kept.png dans les rapports.

Le transport refuse les événements de retry/error de la session possédée,
annule immédiatement le POST et son serveur, et publie uniquement une formulation
contrôlée. Événements étrangers ignorés et credentials non affichés. Les agents
de code emploient ce transport observable et conservent le motif du refus dans
leur résultat, sans tentative d’effet ni changement automatique de modèle.
Le modèle par défaut opencode-go/deepseek-v4.1-flash est conservé.

Vérifications : model-progress + code-worker-loop + model-switch, 25 PASS ;
binary-model, 43 PASS ; terminal-code-workers, 27 PASS ; test ciblé quota worker,
1 PASS. Compilation zéro erreur TypeScript ; git diff --check PASS.
Les deux derniers groupes vérifient les contrats existants, pas un succès Flash.

Schéma consulté : https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/schema/src/session-status-event.ts
et https://dev.opencode.ai/docs/server/.
Le comportement installé observé prime sur ces références.

Reste MA-T03 P0 : deux agents Flash réussis dans le terminal, avec reprise.
Le quota fournisseur est actuellement épuisé ; son renouvellement ou un choix
humain d’une route disponible est requis pour cette preuve. Aucun fallback,
achat, modification de quota ou autre fournisseur n’a été sélectionné.
État global : IMPLEMENTING, acceptation MA03 FAILED, pas de clôture annoncée.

## Suite autorisée : route alternative et inspection lisible

Le propriétaire autorise explicitement un autre modèle pour MA03, en conservant
Flash comme défaut global. Le choix local effectué dans le terminal est
openrouter/openrouter/free ; les routes Go et OpenRouter payantes sont refusées.
La route Qwen gratuite répond au probe mais subit un rate-limit dans le parcours.
Deux vrais agents ont été admis par le routeur gratuit, avec un effet node observé,
mais aucun lot de deux propositions réussies. MA03 reste FAILED.

MA-T09 P1 IN_PROGRESS : la vue Agents doit conserver titre, aide, saisie et
raison d'échec malgré des tâches et chemins longs. Le défilement doit atteindre
le second agent et le dernier diagnostic aux quatre tailles requises.
La publication terminal.code-worker doit conserver le diagnostic déjà présent
dans terminal.agent, sans nouvelle autorité ni effet. Les anciennes publications
restent lisibles. Vérifier régression UI avec chemins réels longs, test de
publication, compilation, puis reprise de la session réelle.
Risque : débordement du contenu masquant les contrôles ; borner les lignes
visuelles avant rendu et conserver la navigation clavier. Pas de migration,
dépendance, changement fournisseur global ou modification d'autorité.

MA-T10 P1 IN_PROGRESS : après une proposition d'outils invalide, refuser tout
le lot sans effet, enregistrer une observation contrôlée rappelant le vocabulaire
et la forme attendue, puis demander une correction dans les huit inférences
déjà autorisées. Aucune tentative supplémentaire après budget épuisé, annulation,
effet incertain ou refus fournisseur. Vérifier lot mixte interdit sans aucun
effet, correction réussie, refus répété borné et publication du diagnostic.

## Preuves de la route alternative et des correctifs

EV-MA-ALT : autorisation humaine explicite de tester un autre modèle.
OpenCode Go Luna refusé ; Zen et b.ai accès refusé ; Copilot erreur fournisseur ;
OpenRouter GPT Mini quota ; Qwen gratuit répond au probe, puis rate-limit.
Le routeur openrouter/openrouter/free a effectivement lancé deux agents dans
le terminal installé, sans modifier le défaut global Flash.

Sessions réelles conservées dans le répertoire de rapports :
- sessions-1791055392161, parent t-037e5c5c-743b-49a0-a62a-d54db566cdcc :
  deux admissions #51/#53, un effet node confirmé, lot échoué.
- sessions-1791055748458, parent t-e77da59c-5b45-4fd2-ae58-fde86de10568 :
  admissions #29/#31, diagnostics #33/#35 maintenant conservés.
  guide-commandes, journal privé t-ae7ff10e-225d-46ad-a91b-6fbb7f1d6bbd :
  écriture node confirmée #3 et lecture cat confirmée #6, fichier
  docs/DAILY-COMMANDS.md conservé dans sa copie. Aucun guide appliqué au source.
  Les propositions suivantes échouent ; l'erreur du coordinateur est une réponse
  non conforme au JSON demandé. Cette route ne prouve pas MA03.

EV-MA-AGENT-VIEW : MA-T09 DONE. La vue utilise des lignes visuelles bornées,
le titre, l'aide et la saisie restent à l'écran. Vérification visuelle réelle
aux tailles 80x24, 120x30, 160x50 et 240x70 après reprise de la première session.
PageDown atteint le diagnostic du second agent. Captures agents-bounded-80.png,
agents-bounded-120.png, agents-bounded-160.png, agents-bounded-240.png et
agents-diagnostic-bottom.png. Esc rend la saisie ; agents-return-draft.png.

EV-MA-TOOL-CORRECTION : MA-T10 DONE. Un lot invalide ne produit aucun effet ;
une observation contrôlée permet une correction dans le budget existant.
Les répétitions sont bornées, les outils interdits restent interdits et les
effets incertains ne sont pas rejoués. Ce mécanisme passe en test déterministe ;
la dernière tentative réelle n'a pas exercé cette branche de correction.

Vérification : agent-ui 1 PASS, code-worker-loop 17 PASS, terminal-code-workers
27 PASS. Build zéro erreur TypeScript, git diff --check PASS. Les tests
vérifient navigation, refus atomique, correction, reçus et préservation ;
ils ne remplacent pas la réussite fournisseur.

EV-MA-ALT-RESTORE : réouverture de la seconde session, aucun effet rejoué.
/changes refuse le lot incomplet avec un message explicite ; seule la mise
de côté est proposée. Capture free-restored-review.png. Défaut global relu :
opencode-go/deepseek-v4.1-flash, inchangé. Copies et journaux conservés.

Audit final de cette livraison : MA01/MA02/MA04 restent vérifiés. MA03 reste
FAILED : le parcours à deux propositions réussies puis revue et reprise manque
toujours, aussi avec la route alternative. Aucun statut global de fin annoncé.
Les refus de quota et les réponses non conformes sont des limites observées,
pas une raison de qualifier le parcours de fonctionnel.
