# CUESHEET — Direction UX / Design de l'interface agentique (12 octobre 2026)

Statut : SPEC À VALIDER, complément de docs/harness/08-TERMINAL-UX.md et HUMAN-LEGIBILITY.md ; pas une implémentation. Le code existant est en React/Ink. Ne pas introduire une librairie de composants populaire par défaut. Privilégier des composants typés maison et des tokens partagés.

## Promesse de la surface

Une personne formule un objectif en langage ordinaire. Une seule surface lui montre : (1) ce que le système a compris ; (2) ce qu'il fait ; (3) ce qu'il sait, ignore ou attend ; (4) comment corriger ; (5) ce qui est effectivement prouvé. Le runtime peut être complexe ; la surface ne doit pas l'imposer.

Ne pas ressembler à un tableau de bord de surveillance permanent. Inspirer confiance par la lisibilité, les états exacts, des phrases humaines et l'accès immédiat aux sources. Sobriété visuelle, espaces, peu de chrome, aucune avalanche de badges, icônes de robots ou logos d'IA.

## Hiérarchie (80 x 24)

    CUESHEET        Projet : intentlane          Model : provider/model
    ───────────────────────────────────────────────────────────────────
    Objectif   Corriger l'intégration notes sans casser les autres intents
    En cours   Vérifie le résultat intégré après 2 modifications
    État       Vérification en cours · 1 décision reste ouverte

    Travail
    ✓ Contrat et critères versionnés
    ✓ Worker A : patch proposé (non vérifié)
    ✓ Worker B : tests collectés (non vérifiés)
    … Intégration : contrôlée
    ? Vérification complète : non conclue

    Activité importante (dernière observation confirmée)
    18 tests ciblés réussis, sortie disponible. Suite complète pas encore lancée.

    > Corrige la priorité du test Siri_
    ───────────────────────────────────────────────────────────────────
    Tab Vues    / Palette    Esc Retour    Ctrl+C Arrêter

Ce rendu est un schéma d'information et non une prétention d'écran livré. Dans le produit, ne pas afficher ✓ pour un worker « patch proposé » comme si sa tâche était vérifiée : lui réserver un libellé et un pictogramme explicite de production, distinct de PROVEN.

## Vues et navigation

Accueil/Travail (par défaut) : intention, contrat courant, étape utile, prochaine décision, résultat. Activité résumée en faits; détails sur demande.
Objectif : texte original, corrections, révision, critères, provenance et plan. Modifier par langage naturel ou édition explicite équivalente.
Agents : responsabilités et scope de chacun, statut, dernière observation, coûts estimés/observés séparés ; jamais un « agent réfléchit » supposé.
Preuves : check épinglé, revision ciblée, hash artefact, méthode, sortie, décision de l'oracle, limites de couverture.
Sessions : reprendre, comparer dernier snapshot/projection, distinguer interrompu de terminé.
Sources/Mémoire/Skills : origine, timestamp, auteur, scope, obsolescence et autorité ; le texte externe reste non fiable.
Modèles : provider, capacités connues/inconnues, coût observé/estimé, changement uniquement à frontière sûre.
Inspect : événements bruts, IDs, receipts, journaux complets via références bornées ; pas de secret.

## États : le wording fait partie de la sécurité

- READY : « Prêt à commencer » (pas « terminé »).
- RUNNING : « Travaille sur… » ; dernière opération réellement observée.
- NEEDS_INPUT : « Une décision est nécessaire » avec action précise.
- BLOCKED : « Bloqué : permission ou condition manquante » ; jamais impression de succès.
- UNKNOWN_EFFECT : « Résultat de l'action inconnu ; vérification avant nouvelle tentative ».
- PRODUCED : « Résultat produit, vérification non terminée ».
- VERIFIED : « Vérifié pour l'objectif Rn avec telle preuve ».
- STALE : « Ce résultat concerne l'ancienne révision Rn ».
- FAILED : « Échec confirmé » avec récupération possible.
- INTERRUPTED : « Interrompu ; aucune nouvelle exécution déclenchée ».
- CANCELLED : « Arrêt demandé / observé » ; distinguer demandes et confirmations.

Règle : pas de transition à VERIFIED déclenchée par la surface ou par la simple réponse positive du producteur. Inconclusive et unknown ne sont pas des erreurs colorées rouges par défaut.

## Interaction au clavier et dimensions

- Entrée : soumettre l'intention seulement lorsque le compositeur est focalisé.
- / : ouvrir palette contextuelle ; Esc : fermer overlay sans perdre le brouillon.
- Tab/Shift+Tab : circuler entre zones utiles ; raccourcis visibles dans Help.
- Arrêt pendant streaming : signaler immédiatement la demande d'arrêt, puis seulement la confirmation.
- Correction R+1 pendant tâche : afficher la modification et l'invalidation des résultats obsolètes, pas bloquer derrière une queue de messages.
- 40×14 : une colonne, objectif tronqué proprement, état et composer toujours accessibles.
- 80×24 : un fil central et détails repliés (schéma ci-dessus).
- 120×40 : panneau de détails facultatif à droite, jamais deuxième vérité.
- Mode NO_COLOR ; contrastes lisibles ; aucun état dépendant exclusivement d'une teinte ; Unicode/graphemes/IME et resize testés.

## Principes visuels

Typographie : texte principal normal, titre discret, monospace terminal naturel. Information avant décoration. Une accentuation pour l'action active, pas des chips multicolores.
Palette : fonds et surfaces neutres, une couleur d'accent paramétrable, alerte et erreur réservées aux événements réellement critiques. Couleurs en tokens nommés ; aucun code de statut sans texte.
Densité : trois niveaux au maximum : objectif > travail actuel > activité / preuve. Les diagnostics techniques vivent dans Inspect.
Animations : streaming stable sans clignotement ; pas de spinner infini lorsqu'un résultat est inconnu ; conserver la dernière observation visible.
Composants maison prioritaires : Composer, WorkSummary, ProgressLine, AgentRow, EvidenceSummary, SourceDetail, Inspector, Palette, StatusBar. Chaque composant reçoit une projection, n'observe ni ne déclenche de travail au render.

## Quatre parcours critiques à tester

1. Entrée naturelle → contrat/version → travail → preuve : la personne sait expliquer ce qui est vérifié.
2. Correction en cours de travail → invalidation Rn → continuité Rn+1, sans notification parasite.
3. Un worker disparaît → état UNKNOWN → reprise après réconciliation, jamais double action silencieuse.
4. Changement de modèle pendant exécution → frontières sûres → statut obsolète de l'ancienne réponse → nouvelles observations.

Mesures : réussites parcours, focus/resize/overlay, temps pour comprendre cause d'un blocage, fréquence de demandes inutiles, part d'états faussement présentés comme succès. Le design est validé par vraies frappes Ink/PTY, pas par image seule.

## Séquence design

D0 : audit des composants Ink et tokens existants (pas de refonte aveugle).
D1 : schéma / états / libellés et tests de projection.
D2 : densité et navigation sur 40/80/120 colonnes.
D3 : écrans Agents, Preuves, Mémoire avec vraie provenance.
D4 : test d'usage humain et comparaison avant/après.

Dépendances : H08 + HUMAN-LEGIBILITY ; aucune tâche de design ne peut modifier les invariants de contrôle d'autorité.
