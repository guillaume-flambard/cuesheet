# H08 : une interface simple pour un travail intelligent

## Résultat

L'écran permet de comprendre ce qui est voulu, ce que fait le harness, ce qui est
établi et ce qui demande une décision humaine. L'entrée principale est la parole
ou le texte naturel. Les commandes techniques restent des raccourcis facultatifs.

## Écran principal

Présenter intention/objectif actif, état de l'exécution, provider/modèle, action
utile en cours et dernière observation importante. La conversation reste lisible.
Specs, tâches, mémoire, sources et agents sont consultables par divulgation
progressive. Ne pas afficher tous les concepts du runtime dans la vue initiale.

Les décisions automatiques importantes ont une justification courte et une action
de correction. Une recherche dit ce qu'elle cherche ; un relais dit pourquoi ;
une vérification identifie le critère et le résultat. Une option de mode ne doit
pas être nécessaire avant d'envoyer une intention.

## Consultation et correction

Prévoir des vues clavier : travail/objectifs, spec et tâches, mémoire, agents,
sources, sessions, modèles, détails d'outil. Consulter un record montre auteur,
base, sources, historique et statut. Corriger ajoute un événement. La saisie
« garde cette contrainte », « change le résultat », « arrête » ou « reprends »
alimente les mêmes contrats que l'éditeur.

Afficher tâches déclarées finies distinctement des résultats vérifiés. Les preuves
historiques ne deviennent pas une validation de l'état actuel du workspace. Une
action sans résultat garde un statut inconnu. Une capacité absente et un conflit
ne ressemblent pas à une réussite.

La vue des agents montre responsabilité, objectif, étape, état et dernière
observation utile. La coordination demeure automatique. Les contrôles d'arrêt,
de reprise et de changement de modèle restent accessibles pendant le travail.

## Ergonomie terminal

Conserver édition par graphèmes, recall, brouillon, scrolling, resize et clavier
déjà réalisés. Supporter au minimum 40×14, 80×24 et 120×40 sans perte des actions
essentielles ; un message trop long ouvre un détail plutôt que cacher les
contrôles. Tester focus et fermeture d'overlay. Une confirmation par Entrée dans
un overlay ne doit pas envoyer le brouillon au modèle.

Couleurs accompagnées de libellés, mode sans couleur, contraste lisible et
indications de focus. Afficher tableaux/textes longs dans une vue scrollable.
Streaming stable, sans clignotement excessif ni blocage du clavier. Garder les
détails bruts dans une vue inspectable, avec secrets filtrés et output truncation
signalée. Le résultat complet est récupérable par une référence bornée.

## Ergonomie clavier, état vérifié (2026-10-16)

Mesuré d'abord dans un vrai PTY (node-pty plus @xterm/headless), sur le dépôt et
sur la copie installée. Défauts trouvés :

- Ink 4 n'a pas de champ `home`/`end` dans `Key`. Home (`\x1b[H`, `\x1b[1~`,
  `\x1b[7~`) et le SS3 (`\x1bOH`) étaient silencieusement perdus.
- Ctrl et Alt plus flèche arrivent en modes `1;3`, `1;5`, `1;7`, `1;9`, non
  reconnus : aucun déplacement par mot.
- `\x08` était lu comme un backspace d'un caractère, pas comme une suppression
  de mot.
- `?` sur un brouillon vide ouvrait l'aide et insérait quand même le caractère.
- Shift plus flèche ne sélectionnait rien : la branche flèche déplaçait le
  curseur sans garder d'ancre.

Corrigé dans les lieux où le comportement vit déjà, sans nouvelle dépendance :
la transformation `terminal-input.ts` ramène Home/End (tous encodages) sur
Ctrl+A/Ctrl+E, les flèches Ctrl/Alt sur le couple canonique de mot, et `\x08`
sur Ctrl+W ; le composer lit directement Ctrl plus flèche, garde une ancre de
sélection avec Shift plus flèche, et remplace ou supprime la sélection en une
seule opération (taper, Retour arrière, Suppr, Escape qui lâche d'abord la
sélection).

Preuves : `node --test test/terminal-input.test.ts test/terminal-keyboard.test.ts
test/editor-view.test.ts` (20 cas, 20 verts). `terminal-keyboard` pilote la
chaîne réelle stdin, transformation, Ink, composer, store. `editor-view`
reconstruit le brouillon à partir des segments rendus, ce qui échoue dès qu'un
graphème est perdu ou dupliqué. PTY réel après changement : Home puis B donne
`Bbanana`, End puis Z donne `bananaZ`, Ctrl+Retour arrière efface un mot, `?`
laisse le brouillon vide, et avec neuf Shift+droite les cellules inverses de la
ligne de saisie lisent `keepthis`, puis `DONE tail` après frappe. La sélection
visible est bien la sélection qui s'édite.

Limites d'Ink 4, explicites et non contournées :

- Ctrl+Shift plus flèche (sélection par mot) est indistinguable d'un saut par
  mot : Ink rapporte ctrl sans shift pour cette séquence.
- Shift+Home et Shift+End ne sont pas exprimables, faute de champ `home`/`end`.

Ces deux combinaisons, ainsi qu'une désambiguïsation fiable d'Escape, sont
fournies en amont par Ink 6 et suivants (publié en 8.0.0) : protocole clavier
Kitty natif, `Key` expose `home`, `end`, `super`, `hyper`, `capsLock`, et une
négociation automatique avec délai. C'est une capacité documentée de la
dépendance, lue dans ses sources (`parse-keypress.ts`, `kitty-keyboard.ts`,
`hooks/use-input.ts`), pas une preuve d'exécution locale. La montée depuis
4.4.1 exige React supérieur ou égal à 19.3, le projet est sur React 18 :
migration majeure, décision propriétaire, hors de cette tranche.

Trois tests de rendu `surface-quality` et un test de palette `workspace-ui`
échouent déjà sur l'arbre non modifié ; ils ne viennent pas de ce travail.

## Acceptation et tâches

- [ ] H08.1 Vue travail progressive et états issus des projections.
- [ ] H08.2 Édition des objectifs, specs et mémoire avec historique.
- [ ] H08.3 Agents, sources et résultats d'outils accessibles au clavier.
- [ ] H08.4 Changement actif de modèle, arrêt et reprise compréhensibles.
- [ ] H08.5 Vérification Ink et PTY aux trois tailles, resize et sans couleur.

Tester le parcours entier avec les vraies frappes : intention, décision automatique,
consultation, correction pendant travail, arrêt, remplacement du modèle, reprise,
validation et rechargement. Un snapshot JSX seul ne valide pas cette interaction.
Conserver les tests de focus, draft et overlay existants.

Dépendances : les projections H01 à H07 au fil de leur disponibilité. Les vues peuvent
être construites par tranches ; elles ne doivent pas faire leurs propres observations
ni lancer une inférence au simple affichage.

## Tranche critères épinglés, H08.2/H08.4

Palette clavier → « Critère de validation » → snapshot propriétaire du contrat courant (texte original, corrections, critères modèle explicitement interprétés, ID/révision/digest du check épinglé). Aucun renouvellement en ouvrant la vue. La personne presse C pour confirmer après lecture ; Escape ferme sans écriture. Le producteur reçoit le snapshot exact capturé à l’ouverture et refuse si la révision a changé pendant la lecture. Aucun choix de fichier/exécution/auto-reprise derrière l’acceptation. Pas de saisie manuelle des IDs nécessaire ; /check reste un override avancé.

Texte long consultable via flèches avec viewport borné à la taille terminal, footer de confirmation visible. Refus de contexte périmé retourne à la conversation avec une explication ; prochain contrôle repart d’un snapshot frais. Composer désactivé tant que la palette reste ouverte. Vérification Ink par vraies frappes : ouvrir n’écrit rien, Escape annule, C confirme exact snapshot ; correction après ouverture refuse la vieille approbation ; sortie/documentation distinguée des critères propriétaire. Parent H08 reste ouvert.
