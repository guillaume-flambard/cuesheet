# Défaut utilisateur : lancement ordinaire et Entrée

Signal humain : interface jugée mauvaise, saisie puis Entrée ne donne pas le travail attendu. Reproduction réelle /Users/memo/.local/bin/cuesheet, PTY100x32 : bonjour est envoyé, working apparaît, puis erreur provider sans proposition ; header opencode-binary sans modèle. Les anciens parcours utilisaient des modèles explicites, donc ne prouvaient pas ce défaut absent.

Hypothèses falsifiables : (1) route OpenCode implicite invalide, choisir explicitement la route Go déjà autorisée doit produire une réponse ; (2) saisie/Entrée perdue, journal du test doit contenir exactement le texte soumis ; (3) rendu masque état/erreur, des instructions visibles au vide, Entrée explicite et erreur actionable doivent rendre le parcours observable. CR testé ; LF et caractères saisis séparément à vérifier.

REQ-UF01 : choix Go autorisé mémorisé par API publique non secrète, sans modifier auth/config OpenCode ; commande nue reprend cette route et répond réellement. AC-UF01 : commande nue exacte, vraie saisie + Entrée, réponse réelle observée ; choix précédent conservé pour rollback.
REQ-UF02 : état vide et composer montrent action, Entrée et menu ; erreur indique sélection Modèles, messages français cohérents, contenu visible80/100colonnes sans débordement. AC-UF02 : vraie surface rendue aux deux largeurs, texte saisi et états observés ; capture conservée.
REQ-UF03 : chemin clavier CR/LF ne perd pas la phrase ; feedback reçu, pas de succès global déduit du test. AC-UF03 : journal neuf contenant une soumission exacte, résultat ou échec explicite.

TODO UF01 P1 IN_PROGRESS -> préférences publiques réversibles -> commande nue réelle. UF02 P1 TODO dépend UF01 -> correctif UI borné -> ciblés/rendu. UF03 P1 TODO dépend UF02 -> vraie commande, captures, source/journal. Risques : effet sur route de sessions nouvelles ; ancien choix conservé, aucun secret lu ni modifié. Pas de refonte orchestration, déploiement, migration, auth ou données. Provider error explicite observé avant patch. Global IMPLEMENTING, précédent verdict complet de produit révoqué ; preuves de tranches anciennes restent historiques.

UF04 P1 DEFECT découvert : route Go répond salut mais la surface reste working et continue des inférences malgré zéro outil demandé, faute de check owner. REQ-UF04 : sans check propriétaire, une réponse non vide sans appel d’outil rend la main et arrête ce tour, en conservant objectif ouvert et texte non vérifié. Les parcours avec check propriétaire conservent leur autonomie. AC-UF04 : une seule inférence, texte visible, busy=false, objectif ouvert, état durable response-delivered ; outils/texte vide/owner check ne déclenchent pas cette remise de main. Régression avant patch -> ciblés -> commande nue réelle. Aucun classement lexical des demandes, aucune clôture depuis une affirmation modèle.

UF03 reproduction précise : driver réel CR produit salut puis response-delivered ; LF laisse merci dans composer et timeout. Source installée Ink parse-keypress.js distingue return CR et enter LF ; use-input.js expose key.return uniquement pour return et transmet LF dans input. Composer vérifie seulement key.return. Correctif borné : accepter input===LF comme soumission, sans modifier collages multilignes, palettes ni autres raccourcis. Test PTY de cancellation/reprise changé pour couvrir CR puis LF, exact deux appels, pas de mutation tardive.

UF05 P1, signal humain screenshot : grande fenêtre, contenu collé en bas, vide énorme, modèle presque noir, métadonnées de conteneur dans conversation, français/anglais incohérents. REQ-UF05 : surface conversationnelle compacte qui grandit avec le contenu puis défile, message/réponse proches du composer, texte secondaire lisible sur fond sombre, modèle visible ; routes/outils/état interne restent dans inspection, actions/failures utiles restent visibles. AC-UF05 : rendu réel à80x28 et220x65, une conversation courte occupe au plus18lignes, message/réponse/composer visibles, métadonnées absentes de conversation mais conservées en state/journal, ratio texte secondaire>=4.5 sur fond screenshot#262a33 ; longue conversation/menus/resize/cancel protégés par régressions. Statut IN_PROGRESS.

Direction : outil de travail terminal, typographie native, une colonne alignée à gauche, teal pour nom/interaction, corps gris clair, information secondaire gris lisible et séparateur discret. Dialogue en flux compact, pas une console vide plein écran. Rôles Toi/Cuesheet, aide clavier sous saisie, aucune réussite du but déduite d’un message. Contrôle critique : supprimer le banner répétitif but ouvert et les métadonnées d’exécution du dialogue sans supprimer ces faits durables. Palette reste accessible, pas de redesign d’architecture.

UF06 P1 : effacement macOS DEL0x7f observé comme key.delete par Ink4, donc suppression devant le curseur ; à la fin du texte cette action ne fait rien. REQ-UF06 : touche Mac d’effacement retire le graphème précédent, forward-delete CSI3~ retire le suivant ; bytes UTF8 et collage conservés. AC-UF06 : vrai lanceur PTY reçoit DEL, flèche gauche, forward-delete, LF et journal contient exactement le texte édité ; Ctrl+C/reprise sans effet tardif. Adaptation des bytes seulement à l’entrée du terminal, pas de patch node_modules ni mapping ambigu de key.delete dans Composer. Risques : flux stdin/raw mode ; tests transport/UTF8/cleanup nécessaires. TODO UF06 IN_PROGRESS -> régression rouge -> normalisation -> ciblés/vraie commande/full.

## Effacement Mac et preuves du correctif

La touche physique Backspace du Mac transmet DEL (0x7f). Ink 4 la classe comme `key.delete`, identique au booléen de suppression avant curseur. Le composer effectuait donc une suppression avant curseur et ne faisait rien à la fin. Un adaptateur de stdin convertit seulement le byte DEL en BS, préserve CSI3~ et tous les bytes UTF8, délègue le mode raw à la vraie TTY et détache son pipe à la sortie.

REQ-UF06 / AC-UF06 : effacer avant et après curseur, Unicode même fragmenté en chunks, retour CR/LF et nettoyage terminal doivent être vérifiés. La régression PTY avant correction a soumis `deuxieme travaiXl` au lieu de `deuxieme travail`; après correction le journal porte la phrase attendue.

Preuves dans `/Users/memo/projects/_reports/cuesheet-intentlane-supervision-2026-10-02/user-launch/` : `delete-red-final.log`, `editor-layout-green.log` (36/37, clavier vert mais défaut de long rendu), `layout-final2.log` (3/3), `editor-live.log` et le journal `editor-live-sessions/t-f4b8d1b0-84d7-4828-a2bb-10a2b895d7cb.jsonl`. Le vrai exécutable installé, sans flags provider/modèle, a accepté la phrase corrigée par DEL puis CR, répondu salut, accepté LF puis répondu merci, et quitté par Ctrl+C avec code 0. Deux tours d'une inférence chacun, phase response-delivered, aucun objectif clos. Ce parcours constitue une preuve du clavier et du transport, pas de la qualité des travaux autonomes.

Le dialogue court utilise au plus 18 lignes dans une fenêtre 220x65; les longs textes ont une largeur explicite et conservent leur fin visible après resize 40x18 vers 30x14. Les métadonnées restent dans l'état et l'inspection. L'acceptation visuelle humaine demeure requise; aucune capture native du terminal n'a été obtenue par l'agent.

## Retour humain et accès modèle

Le propriétaire rejette encore la surface après le premier rendu compact. AC-UF05 demeure PENDING et aucune acceptation humaine n’est attribuée. Command+K efface l’écran dans Terminal; Control+K est le raccourci applicatif existant. UF07 ajoute Control+P visible au header/composer et `/model` ou `/models`, interceptés avant toute inférence. Entrée LF fonctionne aussi dans le sélecteur. La sélection reste soumise aux validations et à la sauvegarde existantes. Les suites générales interrompues pour intégrer ces retours ne constituent pas des PASS.

## Plein écran, progression, défilement UF08

Instruction propriétaire : utiliser toute la fenêtre, afficher une animation de chargement et savoir ce qui se passe, permettre le défilement. Remplace explicitement le critère de hauteur compacte UF05. Modèle : largeur réelle et hauteur réelle, composer fixe en bas, indicateur de temps depuis début busy, activité déduite des actions actives ou attente modèle, texte explicatif public du modèle déjà visible. Aucun raisonnement interne inventé. Trackpad/molette via protocole souris SGR, clavier PageUp/PageDown conservé, séquences souris filtrées hors composer et modes terminal nettoyés à la sortie. Risques : resize, sélection de texte, chunks de protocole, historique ancien et animation sans boucle de rendu infinie. Vérification : rendus de frames initial/resize, attente modèle et outil, stop animation, souris fragmentée et PTY. Deux échecs full antérieurs capsule/session UI restent ouverts.

## Qualité du tour UF09

Question du jour : capture humaine montre lectures répétées, outils indisponibles et tentatives organize_work refusées. Le prompt impose maintenant la réponse informative sans créer de plans/mémoires/fichiers non demandés et une proposition terminale toolCalls vide quand les sources suffisent. Ce guidage ne garantit pas le comportement du provider; le parcours réel reste nécessaire. Les échecs affichent exit ou résultat non confirmé et première ligne de cause. Les arrêts budget ne sont plus masqués avec les réponses simples. Le replay de session attend une inférence par réponse terminale au lieu des anciennes répétitions8/16; aucune assertion de reprise, historique ou journal n’a été retirée. C’était la cause commune des deux échecs full, dont la capsule imbriquée.

## Langue UF10

Le propriétaire demande l’anglais par défaut pour l’interface. Les libellés des composants, menus, aide et sélecteurs sont en anglais. Le texte utilisateur, les sources et les propositions du modèle ne sont pas traduits par le renderer. La langue de conversation ne modifie pas les libellés UI. Tests ajustés seulement pour les libellés effectivement changés; aucun oracle de sécurité/acceptation retiré.

## Vérification finale et limites

Suite finale : 1020 tests, 1011 PASS,0 échec,9 skips,185916ms. Les7 skips Docker ont été exécutés dans un lot complémentaire18/18 PASS avec CUESHEET_TEST_TOOL_IMAGE; les2 essais provider indépendants restent explicitement opt-in. Capsule indépendante et parcours installé d’intégration exécutés dans la suite principale. Build PASS avec32 diagnostics hérités; différentiel de typage surface PASS; git diff --check PASS.

Clavier réel DEL/CR/LF, modèle Go authentifié, accès Control+P et /model sans inférence, attente animée/temps et molette SGR avant/arrière avec modèle fixture retardé PASS. Question du jour avec modèle réellement sélectionné :3 étapes, arrêt response-delivered, aucun organize_work; seule cette observation bornée est certifiée.

Pas de capture ni de manipulation native Ghostty/Warp : getApp refuse leurs bundle IDs pour safety reasons même après activation Any App et autorisation humaine. L’acceptation visuelle est ouverte. Les pages d’inspection gardent des métadonnées système françaises héritées : UF10 n’est pas annoncé complet. Phase globale IMPLEMENTING. Aucun commit ni push.

UF10 reprise : traduire les libellés système générés des pages notifications/workspaces/situation/agents/contexte. Préserver textes utilisateur, chemins, enums, provenance et contenu des propositions. Les tests de reprise, pagination et refus doivent conserver leurs assertions, seuls les libellés affichés changent.

## Owner design rejection, 2026-10-03

Original reference recovered from ChatGPT conversation `cuesheet`, ID 6ab9fe66-2cc8-83ed-9e04-76d2934afe9d, specifically accepted Human Surface V2 and subsequent continuous shared-work clarification. Current machine PASS is not visual acceptance.

Required reference: thin header; full terminal viewport; central conversation with speaker labels above paragraphs; compact Read/Inspect/Edit/Test/Verify work events; permanent Ask anything composer; discreet contextual footer; technical mechanics in inspection; repository optional; no mandatory manual regime; continuous user input. Work status must reflect observed activity without fictional agents or reasoning.

Finite alignment work: D01 speaker/paragraph hierarchy and readable margins; D02 header/composer/context-footer comparison; D03 compact actions and live state; D04 empty/error/long-conversation and narrow/wide resize; D05 installed interaction regression and visual acceptance. All are open, required for design acceptance. D01 affects Timeline layout only; preserve entry identity, full text and scroll measurements. Verify existing terminal UX and rendering regressions, then broader required gates after final implementation. No kernel or persisted schema change is required by D01.

Risks: longer vertically separated conversation must remain scrollable; width calculations must preserve full text; additional padding must not overflow small terminals. Owner acceptance remains failed pending actual realignment.
