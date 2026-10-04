# Cuesheet: mémoire produit et architecture

Source propriétaire reçue le 2026-10-03 :
[document original](MASTER-PRODUCT-DIRECTION.source.txt).
Cette référence explicite les 44 concepts du texte fourni. Elle conserve la
vision sans annoncer son implémentation. Les détails opérationnels et leurs
preuves restent dans les specs existantes et state.json. Les futures reprises
doivent lire ce document avant de concevoir ou de coder.

## Invariants de reprise

Le runtime synchronise continuellement intention humaine, compréhension machine,
réalité logicielle et preuves. Le logiciel est son premier domaine d'application.
World > Project > Session. L'intention prime sur le prompt. Les stratégies sont
internes. La personne peut corriger pendant le travail. Le contexte durable est
commun et sourcé. La vue humaine explique les changements utiles. Une preuve
indépendante ferme le travail. La vision immense ne change pas le critical path.

## 01. Thèse produit

Cuesheet maintient l'alignement entre ce qui est voulu, ce qui est compris, ce qui
existe et ce qui est démontré. Une interaction déclenche compréhension, choix du
travail, allocation de capacités, action, vérification et synchronisation humaine.
Réduire cette boucle à une conversation munie d'outils perd la responsabilité de
suivre l'intention jusqu'à son résultat. Les connaissances issues du travail
doivent rester réutilisables, avec leur provenance.

## 02. World > Project > Session

Le World relie projets, savoir et capacités. Depuis le home, une même intention
peut traverser IntentLane, Kollio, une recherche et un document. L'utilisateur
n'a pas à changer de cwd, sélectionner un projet ou ouvrir un chat par dépôt.
Les scopes et droits d'exécution restent explicites en interne : continuité de
l'expérience ne signifie pas permission générale sur la machine.

## 03. Zero modes

Répondre, rechercher, planifier, coder, vérifier ou attendre sont des stratégies
choisies selon la demande et la réalité. Aucun sélecteur Chat/Plan/Build/Debug
n'est nécessaire avant de parler. Les choix importants restent consultables et
corrigeables. Leur automatisation ne retire pas le contrôle humain.

## 04. World awareness

La compréhension s'appuie sur registres, Git, manifests, documentation, outils,
services et connaissances établies. Découvrir progressivement selon la demande,
en privilégiant les sources déjà connues. Un scan complet préalable gaspille
temps et ressources et peut traverser des limites de confidentialité.

## 05. Intent

Un intent porte acteur, résultat souhaité, raison, contraintes, critères,
hypothèses, provenance et statut. Il survit aux messages et aux changements de
modèle. Une reformulation conserve sa continuité ; une correction révise ce qui
doit être satisfait. Les critères servent à juger le résultat réel.

## 06. Intent graph

Relier intention, décision, domaine, contrat, implémentation, données, preuve et
résultat. La navigation doit aussi fonctionner depuis un fichier ou une API vers
sa justification, ses consommateurs et ses preuves. Les relations sont sourcées
et les liens inférés sont distingués des faits.

## 07. Intent drift

Comparer le travail courant à l'intention et aux contraintes. Un changement qui
touche auth ou permissions pour renommer un titre exige une explication de ses
dépendances. Un impact nécessaire peut être réconcilié dans le scope autorisé ;
un impact gratuit constitue une dérive. Aucun blocage aveugle ni expansion tacite.

## 08. Intent compiler

Direction à terme : normaliser le langage humain en intention, contraintes et
critères, puis traverser le World, détecter conflits et faisabilité, produire le
graphe de travail et les preuves. Cette idée ne commande pas de construire un
nouveau compilateur immédiatement. Les originaux et ambiguïtés restent conservés.

## 09. Feasibility engine

Évaluer dépendances, compatibilité, migrations, sécurité, capacités, ownership,
testabilité et rollback. Employer FEASIBLE, FEASIBLE_WITH_CONSTRAINTS, UNKNOWN,
CONFLICT ou BLOCKED avec raisons et sources. Un score LLM ne remplace ni faits
ni autorisation. UNKNOWN appelle une observation ciblée.

## 10. Reality / state graph

Représenter domaines, fichiers, APIs, contrats, schemas, tests, CI, services et
preuves par des éléments déterministes et sourcés. Le modèle peut proposer des
relations, sans transformer son inférence en fait. Couverture et inconnues font
partie du graphe ; une absence de relation ne prouve pas une absence d'impact.

## 11. Impact engine

Depuis un nœud modifié, suivre ses dépendances vers les surfaces touchées et les
validations nécessaires. Une propriété consommée par mobile ou DB exige les
checks correspondants. La validation découle des relations observées et des
inconnues pertinentes, pas seulement des fichiers que le producteur a édités.

## 12. Counterfactual graph

Idée future : explorer les conséquences d'un changement sans l'appliquer.
Séparer impact connu, inféré et inconnu. Cette simulation aide une décision,
mais ne vaut pas preuve d'exécution ni garantie que le graphe est complet.

## 13. Epistemic runtime

Qualifier les affirmations matérielles : OBSERVED, INFERRED, ASSUMED, UNKNOWN.
Une consommation d'API vue dans un fichier est observée ; les consommateurs
externes non accessibles restent inconnus. L'inférence guide l'exploration ;
les preuves ferment le travail. Montrer sources et limites dans les détails.

## 14. Knowledge half-life

Une connaissance porte provenance, fraîcheur, sources de soutien et invalidateurs.
Quand une source change, son statut peut devenir STALE et exiger une nouvelle
observation. La mémoire durable n'est pas une vérité permanente. Une preuve
historique ne valide pas automatiquement la réalité actuelle.

## 15. Shared engineering state

Les connaissances importantes de l'humain deviennent adressables par les agents,
et les découvertes des agents par les humains et agents concernés. Structurer
faits, décisions, contraintes et preuves dans l'état commun. Distribuer toutes
les conversations à tout le monde ne remplit pas ce contrat.

## 16. Context capsule

Chaque worker reçoit l'intention, les décisions, le voisinage du graphe, le code,
les contrats, tests, changements et preuves nécessaires à son travail. Une capsule
est une sélection bornée, pas une seconde vérité. Les sources omises restent
retrouvables selon les droits applicables.

## 17. Progressive context expansion

Commencer avec un sous-graphe restreint. Lorsqu'une dépendance manque, étendre
la frontière d'un pas utile plutôt que charger le World entier. Identifier la
raison de l'expansion et rafraîchir les révisions utilisées par le worker.

## 18. Context market

Idée d'allocation : comparer pertinence, gain d'information, fraîcheur, tokens et
latence pour obtenir le minimum suffisant à la prochaine incertitude. Ne pas
inventer de valeurs ou confondre petit contexte et contexte adéquat. L'économie
de contexte doit préserver contraintes et preuves nécessaires.

## 19. Adaptive execution loop

OBSERVE → MAP → ASSESS → BUDGET → ROUTE → ACT → MEASURE → RECONCILE.
Réévaluer intention, scope, complexité, risque, temps, coût, contexte, compute,
blocages et preuves au fil des observations. Une nouvelle donnée peut modifier
la stratégie ; les effets confirmés et dépenses réelles restent conservés.

## 20. Progressive discovery

Avant une inférence coûteuse, utiliser les observations locales déterministes :
taille, langages, manifests, Git, tests, contrats et CI. Adapter la découverte à
l'incertitude utile. Une commande trouvée dans un dépôt n'est pas automatiquement
autorisée à s'exécuter.

## 21. Modèle ≠ agent

Un worker possède travail, intention, contexte, preuves et question ouverte.
Son modèle est une capacité de calcul interchangeable. Remplacer ce compute
conserve l'identité du travail et ses exigences. La reprise ne dépend pas d'une
conversation privée avec un modèle donné.

## 22. Resilient model fabric

OpenCode Go et Zen sont les providers initiaux importants. Découvrir le catalogue
disponible plutôt que figer des noms. Un quota épuisé appelle checkpoint, choix
d'une capacité compatible et reprise lorsque possible. La résilience ne promet
ni quotas infinis ni disponibilité d'un remplacement autorisé.

## 23. Failure classification

Distinguer TRANSIENT, RATE_LIMIT, QUOTA_EXHAUSTED, CONTEXT_OVERFLOW, AUTH,
MODEL_UNAVAILABLE et INVALID_REQUEST. Choisir une récupération adaptée à la
cause. Répéter trois fois chaque requête peut aggraver la panne ou la dépense ;
une erreur d'auth doit rester visible plutôt que devenir un retry silencieux.

## 24. Circuit breaker et global backpressure

Le runtime tient compte de la pression collective sur un provider. Plusieurs
workers ne doivent pas produire une tempête de retries indépendants face aux
429. Réduire concurrence, rerouter ou différer le non-critique en protégeant les
capacités du critical path. Cette direction n'atteste pas un contrôleur livré.

## 25. Adaptive model routing

Router une unité selon ses besoins : outil déterministe pour imports ou tests,
compute peu coûteux pour un résumé borné, capacité adaptée pour code ou ambiguïté.
Escalader sur preuves de difficulté, puis réduire si elle disparaît.
Déterministe avant probabiliste, peu coûteux avant cher, local avant global.

## 26. Le temps comme ressource

Une limite de quarante minutes doit laisser place à découverte, implémentation,
vérification et marge. Sous pression, réduire l'exploration optionnelle, sans
supprimer les checks nécessaires. Une tranche expire ; l'intention reste ouverte
si ses critères ne sont pas satisfaits.

## 27. Budget controller

Considérer temps, tokens, argent, latence, contexte, CPU, RAM, GPU et quotas.
Allouer et mesurer les ressources réellement disponibles. Les coûts inconnus
restent inconnus. Une limite annoncée ne crée pas de permission supplémentaire
ni une preuve de réussite.

## 28. Work graph

Les dépendances déterminent l'exécution. Le master distingue DISCOVERED, READY,
CLAIMED, RUNNING, VERIFYING, PROVEN, BLOCKED, STALE, SUPERSEDED et CANCELLED.
Cette sémantique produit n'impose pas de renommer les états du protocole projet.
Un travail PROVEN demande des preuves actuelles, pas une case cochée par le modèle.

## 29. Elastic workforce

Le nombre de workers dépend du parallélisme utile, des ressources, du contexte,
des conflits et du critical path. Éviter à la fois les workers inutiles et
l'attente d'un worker capable lorsqu'un travail admissible existe. Une barrière
de synchronisation peut volontairement suspendre cette allocation.

## 30. Work stealing

Un worker disponible peut recevoir le prochain travail utile au lieu de mourir
automatiquement. Le contexte déjà acquis compte dans ce choix. Ce contexte doit
néanmoins être rafraîchi s'il est devenu périmé ; le garder chaud ne le rend pas
valide pour tous les travaux.

## 31. Agent assist

Un worker peut demander une aide ciblée en nommant besoin et travail bloqué.
Le helper retourne découverte, preuves, limites, implications et inconnues.
Éviter les longues conversations inter-agents et les chaînes d'aide sans but.
Les résultats utiles rejoignent l'état partagé avec leur provenance.

## 32. Knowledge delta routing

Une découverte entre dans l'état commun ; sa pertinence détermine quels workers
reçoivent le delta. Chaque destinataire voit ce qui affecte son travail, avec
sources et révision. Aucun broadcast intégral des chats ni contournement des
permissions par agrégation.

## 33. Peer / adversarial review

Adapter l'indépendance et l'effort de revue au risque, à l'incertitude et à
l'étendue d'impact. Une vérification indépendante cherche les défauts et les
preuves manquantes. Ne pas lancer systématiquement plusieurs reviewers pour
chaque changement trivial.

## 34. Live steering

Une correction humaine révise immédiatement le contexte partagé. Les workers
non touchés continuent ; les concernés checkpointent et replanifient ; les
travaux invalides s'arrêtent à une frontière sûre. La saisie reste disponible.
Le message n'attend pas derrière une réponse et ne lance pas un travail isolé.

## 35. Sync barrier

Stop, faisons le point peut arrêter les nouvelles prises de travail, atteindre
les checkpoints sûrs, persister et réconcilier, puis présenter le point commun.
La personne peut continuer, rediriger ou annuler. Une barrière de synchronisation
ne signifie pas forcément tuer tous les processus.

## 36. Human legibility

Maintenir la compréhension utile du travail : ce qui est touché, où on en est,
pourquoi, comment on sait, ce qu'on ignore et ce qui change. La vue humaine est
une projection du même état que les agents. Elle ne raconte pas chaque opération
et ne demande pas à l'utilisateur de coordonner le runtime.

## 37. Human delta

Présenter les nouvelles informations qui modifient la compréhension nécessaire.
Exemple : une propriété est aussi consommée par mobile ; sa suppression casse
un contrat ; le plan préserve donc la compatibilité. Associer changement,
implication et décision, avec source accessible. Éviter de répéter tout l'historique.

## 38. Confirmation by exception

Routine : silencieuse. Information : affichée. Hypothèse importante réversible :
affichée avec continuation autorisée. Décision indispensable, irréversible ou
réellement ambiguë : blocage adapté. Ces niveaux ne créent pas de droits et
n'autorisent pas à déduire une approbation du silence.

## 39. Human model

Suivre seulement faits, décisions, hypothèses et questions effectivement
communiqués, avec dernière synchronisation. Comparer ce registre au savoir du
système pour décider d'un delta utile. Présenté, livré et acquitté sont distincts ;
aucun de ces états ne prouve les pensées ou la compréhension de l'humain.

## 40. Teach back

Pour une décision importante, expliciter résultat voulu, contrainte majeure,
limite volontaire et critère de succès. Ce point rend l'interprétation corrigeable.
Il n'impose pas une question de confirmation à chaque étape ni une reformulation
longue avant toute action.

## 41. Proof before done

Intention satisfaite et preuves requises satisfaites permettent la clôture.
La déclaration du producteur ne suffit pas. Une limite, une sortie textuelle ou
un succès d'outil isolé ne ferme pas l'objectif. Conserver les verdicts et leurs
sources sous le contrat courant.

## 42. Proof-carrying work

Un résultat transportable relie intention, changement, impact, preuves, inconnues
et verdict. La personne et un successeur peuvent vérifier ce qui a été démontré
sans relire toutes les conversations. Ne pas masquer les réserves dans une
conclusion générale de réussite.

## 43. UI proof

L'UI exige preuve d'implémentation, preuve de comportement et preuve de rendu.
Un snapshot ou une compilation seuls ne vérifient ni interaction ni apparence.
Exercer la vraie interface, les frappes, tailles, overlays, scrolling et reprises.
Un prototype HTML n'est pas une validation du terminal livré.

## 44. Render proof : source incomplète

Le texte fourni annonce une boucle puis s'arrête à CHANGE. La suite n'est pas
disponible et n'est pas reconstruite ici. La section 43 suffit à imposer un rendu
réel pour la vérification UI ; elle ne permet pas d'attribuer au propriétaire une
procédure détaillée absente de la source.

## Vision, travail actuel et références visuelles

Complément antérieur : [NORTH-STAR.md](NORTH-STAR.md) contient notamment la
direction Resource Fabric et peer-to-peer entre machines, absente des 44 sections
reçues ici. Cette mémoire du master ne remplace pas ce complément.
État réel par concept : [audit d'implémentation](CONCEPT-IMPLEMENTATION-AUDIT.md).

Ce catalogue conserve les concepts ; il ne crée pas 44 chantiers immédiats.
Le backlog, les dépendances et preuves courantes restent dans state.json et les
specs H01 à H11, State Graph, Intent Map Adaptive et Human Legibility.
Ne pas recopier leurs anciens résultats comme de nouvelles validations.

La direction visuelle propriétaire est épurée et propre à cette mentalité produit.
Le précédent prototype de terminal générique a été rejeté. La nouvelle réalisation
Open Design est en cours et doit être évaluée ; les images originales restent
introuvables. Aucun rendu actuel n'est déclaré fidèle à ces images.

## Vérification de cette mémoire

Critères : 44 sections présentes dans l'ordre de la source ; source conservée
octet pour octet ; renvoi obligatoire depuis AGENTS.md et les points d'entrée ;
distinction explicite entre direction, état livré et source manquante.
Cette mémoire est persistée sur disque. Elle ne garantit pas une mémoire interne
permanente du modèle ; les consignes de reprise assurent sa relecture.
