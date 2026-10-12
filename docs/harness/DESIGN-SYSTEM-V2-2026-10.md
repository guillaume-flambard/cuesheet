# CUESHEET Human UI V2 — contrat de design détaillé (12 octobre 2026)

Statut : SPEC D'EXPÉRIENCE, non implémentée. Complète docs/harness/08-TERMINAL-UX.md, HUMAN-LEGIBILITY.md et INTERFACE-DESIGN-2026-10.md. Aucune capture maquette ne fait preuve d'une implémentation. La livraison devra être vérifiée avec les composants React/Ink réels, des parcours clavier et PTY, sans bibliothèque de composants populaire ajoutée par réflexe.

## Positionnement UX

Le terminal est un cockpit de travail, pas un monitoring d'LLM. L'utilisateur sait immédiatement : que veut-on faire, qu'est-ce qui a réellement été exécuté, qu'est-ce qui est encore inconnu, pourquoi ça bloque, quelle preuve existe, que puis-je corriger maintenant ? Les opérations routinières restent discrètes ; toute incertitude qui change une décision est visible.

Direction visuelle : humaine, silencieuse, aérée, sans « AI badges », sans robots et sans gradients gadgets. Hiérarchie par contenu et espacement, pas par dizaines de pills. Couleurs et symboles accessibles et secondaires au texte. Pas de copy/paste esthétique Claude Code/OpenCode : même sophistication d'usage, identité indépendante CUESHEET.

## Écrans d'information, du plus important au plus profond

1. HOME / Work : objectif actif, état certifié, dernière étape réellement observée, blocage éventuel, prochaine action humaine et composer.
2. OBJECTIVE : contrat en cours (intention d'origine, révisions, critères épinglés, plan proposé, auteur des modifications).
3. AGENTS : workers et capacités / scope, tâche, état, dernier reçu, coût observé/inconnu ; coordination cachée par défaut.
4. EVIDENCE : snapshot hashé, critères, vérificateur indépendant, verdict, limites et outils de relecture.
5. MEMORY / SOURCES / SKILLS : scopes, provenance, date, auteur, versions, contradictions et signaux d'obsolescence.
6. SESSIONS : historiques, status open/interrupted/verified, reprise explicite et récupération.
7. MODELS : providers, capacités, budget, disponibilité et changement de modèle dans une zone sûre.
8. INSPECT : events/receipts/logs/outils bruts filtrés de secrets, accessible quand nécessaire.

Chaque vue lit les mêmes projections. La vue ne peut jamais observer le monde, inventer un statut ou exécuter une tool call par un effet de rendu. Contrôleur seul propriétaire de la décision et des effets.

## Trois formats canoniques

### 40x14 — compact

CUESHEET  • intentlane  • working
Corriger l'intégration Notes
Vérifie la modification intégrée
Dernier fait : tests ciblés OK
À déterminer : test Siri réel

> corrige la priorité du check _

Tab vues | / palette | Esc retour

Limites : le projet et le modèle peuvent être dans la palette, pas besoin d'encombrer la première ligne. Composer et statut restent accessibles en toutes circonstances.

### 80x24 — normal

CUESHEET        intentlane                                      model-a
-------------------------------------------------------------------------------
Objectif       Corriger l'intégration Notes, sans casser les autres intents
État           Vérification du résultat intégré
Observation    Tests ciblés validés. Test Siri réel encore inconnu.

Travail
  Contrat R3          défini et épinglé
  Worker A            patch produit, pas encore vérifié
  Worker B            résultats de tests collectés
  Intégration         observée, vérification en cours
  Preuve              insuffisante pour clôturer R3

Dernière décision importante
  Le périmètre du test Siri reste à confirmer ; aucun succès global annoncé.

> change l'ordre de la vérification _
-------------------------------------------------------------------------------
Tab vues    / commandes    Esc fermer    Ctrl+C arrêter

Cette maquette est structurelle : pas de symboles de validation trompeurs pour un simple patch produit. La priorité visuelle reste l'objectif et la dernière information significative.

### 120x40 — large

Même fil central 80 colonnes, panneau droit facultatif « Détails » : worker sélectionné, preuve, sources, check, version. Le panneau ne devient pas une deuxième colonne de vérité ni un dashboard toujours visible. Le rétrécissement conserve la sélection, focus et brouillon.

## Contrat des états et formulation exacte

| Machine / projection | Texte bref humain | Action possible | Ne jamais inférer |
| --- | --- | --- | --- |
| READY | Prêt à commencer | démarrer ou corriger | terminé |
| RUNNING | Travaille sur [étape observée] | corriger / arrêter | qu'il progresse s'il n'y a pas de nouvelle observation |
| EFFECT_REQUESTED | Action demandée, réponse en attente | inspecter | exécutée |
| UNKNOWN_EFFECT | Résultat inconnu : vérification nécessaire | réconcilier / inspecter | échec ou succès |
| PRODUCED | Résultat produit, non encore validé | ouvrir le patch | accepté |
| VERIFYING | Vérification indépendante en cours | afficher critère | preuve définitive |
| VERIFIED | Vérifié pour Rn (preuve accessible) | ouvrir preuves | satisfaction d'une révision ultérieure |
| REJECTED | Ne satisfait pas le critère [nom] | corriger / replanifier | corruption ou perte de tout historique |
| BLOCKED | Bloqué : [condition exacte] | voir condition / décider | succès silencieux |
| INTERRUPTED | Interrompu, aucune reprise automatique | reprendre / inspecter | continuité en cours |
| CANCELLING | Arrêt demandé, confirmation attendue | inspecter | process effectivement arrêté |
| CANCELLED | Arrêt constaté, travail sauvegardé | reprendre si autorisé | vérification |
| STALE | Résultat historique pour Rn, contrat courant Rn+1 | revoir / retravailler | validité nouvelle |
| PROVIDER_UNAVAILABLE | Modèle indisponible : [raison] | choisir un autre modèle | fallback caché |

Le verdict de l'outil est indépendant du message du modèle. Exemples : « fichier écrit » ne signifie pas « test réussi » ; « tests ciblés réussis » ne signifie pas « fonctionnalité complète ». Un résultat long affiche un résumé honnête et une référence permettant de lire les octets bruts.

## Composition et tokens

Token groups recommandés : background, surface, surfaceRaised, textPrimary, textSecondary, textMuted, accent, attention, error, success, focus, separator. Aucun hex imposé avant audit de apps/terminal/src/theme/tokens.ts ; utiliser les contrastes réels des terminaux et NO_COLOR.
Densité : une action principale, une raison de blocage pertinente, détails par expansion. Aucune ligne de badges répétée pour tous les agents. Titres courts, paragraphes courts, monospace simple, lignes suffisamment aérées.
Tokens sémantiques, jamais business logic dans la palette. Les tests d'état ne doivent pas dépendre d'une couleur.

Composants propriétaires à auditer et adapter : Header, Composer, Timeline, StatusBar, Palette, Projects, Sessions, Models, AgentModels, Inspect. Candidats nouveaux si nécessaires : WorkSummary, ObjectiveCard, EvidencePanel, AgentProgress, HumanDelta. Chaque composant reçoit un ViewModel dérivé et émet une intention utilisateur ; jamais un accès adapter direct.

## Interaction et raccourcis

- Entrée dans Composer envoie une intention naturelle ; Entrée dans overlay sélectionne, ne soumet pas le texte conservé du composer.
- / ouvre palette contextuelle, Esc ferme l'overlay ou abandonne un focus, sans perte de brouillon.
- Tab/Shift+Tab naviguent vers zones actives ; focus clairement indiqué même NO_COLOR.
- Ctrl+C : demande d'arrêt immédiate puis confirmation indépendante de l'arrêt effectif.
- Commandes textuelles facultatives, mais l'utilisateur n'a pas à écrire une commande technique pour corriger un objectif.
- Une phrase en cours de run « change le critère » produit une nouvelle révision et invalide l'autorité de clôture de R précédente avant autre tool mutating.
- Changer de modèle pendant streaming ne publie aucune réponse tardive du modèle abandonné.
- Contraste, Unicode/graphemes, historique, scroll et resize testés contre de vraies séquences d'entrée.
- Une sortie de plus de 120 lignes ouvre une lecture paginée/référencée, pas un dump qui écrase le composer.

## Parcours à valider (exactement, dans cet ordre)

D1 : surface avant/après, état réel et tokens, conserver baseline.
D2 : objectif libre → contrat R1 → appel outil demandé → effet observé → patch produit → check oracle → PROVEN ou INCONCLUSIVE ; wording correct à chaque événement.
D3 : édition humaine R2 pendant RUNNING : proposition R1 stale, aucune validation trompeuse, pas de suggestion obsolète activable.
D4 : crash du worker et redémarrage : UNKNOWN affiché avant reconciliation et aucune commande répétée automatiquement.
D5 : modal palette, inspection preuve, retour, composer intact et pas de message envoyé au modèle par un simple Enter.
D6 : 40x14, 80x24, 120x40, resize dynamique, NO_COLOR, palette sans focus caché.
D7 : long historique et 10 000 événements, affichage de fait récent, sortie de tool complète récupérable.
D8 : modèle A vers B, stop au milieu d'une tool, annulation, reprise sur contrat et budget existants.
D9 : personne externe : elle retrouve ce qui est sûr/inconnu/attendu en moins d'une courte lecture. Mesurer, ne pas seulement qualifier le design de joli.

## Rapport et critères de livraison

Pour chaque PR UX : capture PTY ou trace concise, largeur et thème, données de ViewModel, keys reproduites, test keyboard complet et résultat. Les critères QA documentés dans docs/harness/08-TERMINAL-UX.md restent obligatoires. « Maquette fidèle » ne suffit pas si la production affiche un faux succès ou si la navigation est cassée. Ne pas commencer ce chantier avant stabilisation CI et frontière de vérification.

Liens de référence : https://opencode.ai/docs/ ; https://github.com/badlogic/pi-mono ; https://code.claude.com/docs/en/overview . Ces sources servent à l'inspiration des interactions, pas à reproduire leur marque ou composants.
