# CUESHEET Daily Driver — UX P0 (12 octobre 2026)

> Décision produit : expérience agréable et efficacité au quotidien sont AUSSI prioritaires que le moteur. Le but est de préférer CUESHEET à Claude Code, Codex CLI et OpenCode pour de vraies tâches. Ce document est un programme, pas une prétention de parité. Backlog canonique : H08 et HL dans TODO.md/state.json ; suivi GitHub #24.

## Positionnement

Un outil de travail, pas un cockpit d'agents. Entrée naturelle, objectif compréhensible, progression et blocages fidèlement attribués ; détails techniques uniquement sur demande. Un compositeur permanent, une colonne principale, des composants React/Ink maison et des tokens sémantiques. Interface humaine, sobre, aérée, pas de gadgets/badges d'IA ni de grosse librairie de composants. Les surfaces restent de simples projections ; elles ne prennent jamais la décision métier.

## Audit avant le premier patch

Le shell existant dans apps/terminal/src/app/App.tsx possède déjà un Header, une Timeline scrollable, un Composer permanent, StatusBar et des overlays Palette, Help, Inspect, Sessions et Models. app/state.ts conserve la vérité d'affichage ; les outils sont exécutés par le producer, hors React. Le contraste est bon mais l'accueil dépend encore du flux d'événements. Une sortie longue peut cacher la dernière demande et l'incertitude la plus récente ; retrouver « où en est mon travail » implique de relire plusieurs lignes.

## Programme en PR indépendantes

- **UX0 Audit et benchmark réel** : 5 tâches identiques chez CUESHEET, Claude Code, Codex, OpenCode ; capturer les vraies interactions, compte de frappes, temps et frictions ; ne pas déduire une équivalence d'une ressemblance visuelle.
- **UX1a Work Focus (première PR)** : dernier message humain + signal observé, incertitude visible ; 2 lignes au format compact, 3 lignes en normal, pas d'emprise sur le compositeur.
- **UX1b Composer premium** : saisie multiligne, historique, @fichiers/source, Unicode, clipboard/paste, combinaisons clavier et focus prévisible.
  - **Tranche livrable #28** : conservation des retours dans l'éditeur grapheme-safe, Ctrl+J pour nouvelle ligne, Alt/Option+Enter si détecté par Ink, Enter pour envoyer, collages groupés sans soumission implicite, 2/3 lignes visibles selon hauteur du terminal et défilement visuel autour du curseur. Le brouillon reste intact lors de l'ouverture de la palette. **Reste à construire** : picker @fichiers sous scope, gestion robuste de bracketed paste multi-chunks/IME et onboarding des raccourcis ; un seul test de collage en chunk ne prouve pas le comportement de tous les terminaux.
- **UX2 Coding Experience** : revue des diffs, fichiers, tests, sorties complètes, corrections pendant une tâche et permissions intelligibles.
  - **Tranche Git Review candidate** : palette « Revoir les changements » (ou recherche review) vers le workspace courant, HEAD, diffs indexés/non indexés et noms des nouveaux fichiers ; pagination clavier, rafraîchissement ; pas de Shell ni I/O dans React. Périmètre contrôlé par inspectAgentGit ; lecture seule, taille bornée, texte non fiable nettoyé des séquences terminal. Observation Git n'est PAS une attestation ni un test. Restent à développer : vue diff hors Git, résultats de tests et oracle, revue de contributions composées, acceptation humaine.
- **UX3 Sessions et reprise** : ouvrir/continuer en moins de deux interactions, orientation claire du projet/modèle, reprise sans effet dupliqué.
  - **Tranche navigation candidate** : filtrer jusqu'à 500 sessions persistées par objectif/projet/id avec casse et accents ignorés ; sélection clavier conservée, aucune sélection implicite quand le filtre est vide de résultats. Les données viennent du chargeur existant, aucune lecture directe de fichiers dans React ; la reprise reste explicitement déclenchée par le propriétaire. Il reste à afficher un résumé de la révision courante et la raison d'un blocage avant le choix.
- **UX4 Navigation rapide** : palette unique contextuelle, projets/modèles/agents, recherche, inspect/effets/preuves, raccourcis découvrables.
  - **Première tranche candidate** : filtre immédiat par saisie libre dans la palette existante, accents/casse ignorés, plusieurs mots, commandes introuvables sans déclenchement par défaut. Ctrl+U remet le filtre à zéro ; Enter ne déclenche que la commande visible sélectionnée ; Esc préserve le brouillon. Les overlays de confirmation/inspection existants conservent leurs protections. Tests dans test/palette-search.test.ts et test/palette-interaction.test.ts. Les autres tâches UX4 restent ouvertes.
- **UX5 Human UI V3 et finition** : rythme, typographie, contrastes, thèmes, NO_COLOR, terminaux 40x14, 80x24, 120x40, scroll et resize sans clignotement.
- **UX6 Dogfooding** : comprendre un dépôt, corriger un test, implémenter une feature, reprendre après interruption, vérifier/fusionner. Chaque retour à un concurrent à cause d'une friction devient un ticket.

## Première tranche et faits vérifiables

- Le projecteur pur projectWorkFocus lit seulement les Entry déjà traduites pour l'humain et le flag busy ; il ne touche pas aux tools, permissions, fichiers ni au journal.
- Il identifie la dernière DEMANDE et non un prétendu objectif Rn. Il affiche le dernier signal d'action, erreur ou incertitude après cette demande.
- Un effet demandé n'est pas exécuté ; un exit réussi est une observation, jamais une preuve que le travail est vérifié ; une incertitude reste « À vérifier ». La surface ne peut pas fabriquer un succès.
- Le résumé reste compact et se cache dans les overlays et les très petits terminaux. La timeline, le compositeur, l'historique et l'inspect restent utilisables.
- Tests ciblés : projecteur, trois tailles Ink réelles (120x40, 80x24, 40x14), aucun débordement de largeur/hauteur, raccourcis Ctrl+K/Esc et brouillon conservé, aucun envoi au modèle depuis le rendu. CI complète requise avant merge.

## Gates des prochaines PR

Premier prompt sans commande technique ; session reprise en deux actions maximum ; raison d'un blocage et preuve vérifiée accessibles en deux gestes ; R+1 pendant exécution sans perte de brouillon ; TUI clavier/scroll/resize/focus/NO_COLOR testée ; 5 tâches réelles sur Mac consignées avec comparaison honnête des usages concurrents. Tester visuellement et par vrais événements PTY, ne pas substituer une maquette.

## Limites explicitement conservées

Work Focus utilise les événements visibles bornés, pas le contrat canonique Rn complet. Il ne remplace pas une vraie carte d'objectif et de preuve issue du moteur. Les projets multi-agents, le diff viewer et le compositeur multiligne restent des sous-chantiers non terminés. Cette tranche ne constitue ni une preuve de parité concurrentielle ni une nouvelle capacité d'exécution.

Dépendances : docs/harness/DESIGN-SYSTEM-V2-2026-10.md, INTERFACE-DESIGN-2026-10.md, HUMAN-LEGIBILITY.md, TODO.md H08, issue #15 (tests PTY), issue #24 (UX).

## Tranche @fichiers (candidat #28, octobre 2026)

Le compositeur propose jusqu'à 3 noms de fichiers suivis par Git au moment du chargement. La saisie d'un suffixe @filtre affiche une suggestion, Tab insère la référence sans soumettre le prompt, et le brouillon reste intact. Les noms sont lus par le producteur dans le répertoire-racine Git attesté, jamais depuis React. Fichiers non suivis et noms typiquement secrets sont exclus ; aucun contenu de fichier n'est lu. L'insertion d'un nom ne garantit PAS que le modèle a accès au contenu ni ne confère une nouvelle permission. Limites : pas de menu navigable à plusieurs résultats, périmètre racine Git seulement, exclusions de noms heuristiques non garanties pour toute donnée secrète, contexte de fichier à fournir via les outils autorisés ; travaux suivants = fraîcheur de l'index, navigation de résultats, validation du contexte réellement envoyé.

## Reçus de vérification historiques (tranche #35)

La revue présente aussi les événements work_produced / work_verified historiquement journalisés, liés par effect id, digest, objectif et révision. Un verdict manquant, orphelin ou périmé est présenté comme non validé. La revue ne recalcule pas les digests du workspace courant : un reçu historiquement vérifié ne signifie pas que les fichiers visibles sont encore validés. Aucun nouveau test n'est lancé à l'ouverture. Prochain lot : associer la sortie intégrale de chaque test au verdict courant, recalculer l'artefact sur le workspace choisi, et détecter la dérive de source avant tout statut VERIFIED actuel.

## Comparaison ponctuelle de digest du workspace (candidat #35)

La revue lit le workspace Git courant uniquement si la racine est attestée, les fichiers sont réguliers et les limites d'inspection sont respectées (3000 fichiers / 64 MiB). Elle calcule le digest selon la même règle de contenu que l'artefact capturé. Une différence signale un reçu historique périmé ; une égalité ne prouve qu'une observation ponctuelle non atomique, sans revalider l'oracle ni l'objectif. Aucune permission ou check n'est créé. L'inspection abandonne sur erreur. Travaux restants : snapshot atomique sous verrou/cohérence temporelle, vérification du contrat courant et sortie de tests paginée.

## Sorties du vérificateur (tranche UX2 #35)

Le vérificateur asynchrone capture maintenant un extrait des sorties stdout/stderr du check exécuté contre l'artefact figé. Extrait plafonné à 4096 caractères dans le reçu, capture mémoire plafonnée à 8192 caractères. Le texte subit une suppression des séquences de contrôle terminal et un masquage de formats courants de jetons. La revue affiche les lignes déjà paginées par sa navigation clavier et les marque « diagnostic non fiable ». Ces heuristiques ne constituent pas une garantie de confidentialité absolue : éviter de faire imprimer des secrets aux checks ; un travail de filtrage stricte et des redactions fondées sur schéma restent nécessaire. La sortie n'accorde jamais VERIFIÉ et ne modifie pas le calcul du verdict. Restent : streaming vers stockage privé hors journal, logs volumineux avec offset et cohérence des preuves sur workspace mutable.

## Diagnostics privés, lot #35

La sortie du check est supprimée de la preuve append-only avant la création du reçu. Elle est stockée dans un sidecar personnel `.diagnostic.txt` en mode 0600 à côté du reçu privé (4096 caractères au plus). La TUI la lit uniquement via une capacité émise par le vérificateur courant, après validation stricte de l'identité du reçu et des permissions, puis l'affiche dans la revue. Les erreurs stderr sont prioritaires pour ne pas être masquées par un stdout volumineux. Aucun texte imprimé ne devient une preuve de succès. Restrictions : les sorties antérieures déjà journalisées ne sont pas supprimées ; le sidecar ne suit pas encore les migrations entre sessions/redémarrages ; les masquages heuristiques ne garantissent pas la confidentialité de tout secret. Travaux suivants : accès contrôlé multi-session et streaming paginé privé.

## Consultation paginable des diagnostics privés — cycle A

Un check exécuté sur un artefact figé peut conserver jusqu’à 16 Kio (octets UTF-8) de diagnostics dans son sidecar privé à permissions restreintes. stderr est prioritaire. La revue récupère au plus 512 lignes et les rend consultables avec les touches de défilement existantes, y compris après recréation du vérificateur. Le reçu JSON et le journal des événements ne contiennent toujours pas la sortie du check. Cette tranche n’est pas un stockage de journaux illimité ni un streaming avec offset : les sorties excédentaires sont tronquées, les filtres de secrets restent heuristiques, et un contrôle ancien ne valide jamais les fichiers actuels.

## Identité du check dans les reçus de revue

Un verdict `VERIFIED` ne peut apparaître comme « vérifié historiquement » pour le contrat courant que si l’effet ciblé, le digest d’artefact, l’objectif et sa révision, ainsi que le digest du critère épinglé à cette révision correspondent. Un reçu provenant d’un autre check ou visant un autre effet reste visible comme historique mais NON VALIDÉ pour le contrat courant. Cette lecture ne recalcule pas le workspace et ne change pas le statut objectif.
