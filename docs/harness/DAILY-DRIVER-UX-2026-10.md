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
- **UX3 Sessions et reprise** : ouvrir/continuer en moins de deux interactions, orientation claire du projet/modèle, reprise sans effet dupliqué.
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
