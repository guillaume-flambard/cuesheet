# EV-UI-RENDER-PROOF — la vraie surface, dans un vrai terminal

2026-10-02 : `npm run ui:verify` monte la vraie `App` dans un vrai PTY, à une
taille contrôlée, pilote un scénario déterministe par de vraies frappes, et lit
la grille de caractères obtenue.

## Ce que ça prouve, et ce que ça ne prouve pas

Ça prouve la SURFACE : la vraie `App`, le vrai reducer de store, la vraie
timeline, la vraie palette, dans un vrai terminal. Le scénario est scripté, donc
ça ne prouve pas que le runtime produit réellement ces états. Cette part reste le
travail de la suite ordinaire, et aucune revendication n'est faite ici qu'elle
soit couverte.

Ce que ça prouve pour de vrai : la réponse d'accueil est livrée DEUX fois avec une
seule identité, donc la projection exactly-once est exercée de bout en bout dans
la surface réelle. Désactiver la déduplication fait échouer le harnais.

## Quatre obstacles mesurés, chacun résolu plutôt que contourné

1. **`spawn-helper` sans bit exécutable.** npm perd le bit en décompressant le
   tarball, et tout spawn échoue alors avec `posix_spawnp failed`, ce qui se lit
   comme un binaire manquant et n'en est pas un. Le harnais le répare : une
   commande qui exige de se souvenir d'un `chmod` n'est pas une commande.

2. **node-pty appartient au workspace terminal, pas à la racine.**
   `test/portability.test.ts` impose que le `package.json` racine ne déclare
   aucune dépendance. Ajouter node-pty à la racine a fait échouer ce test et
   `PORT-05`, ce qui a été constaté puis corrigé.

3. **Un pipe n'est pas un terminal, et un strip ANSI n'est pas un écran.** Ink
   refuse le raw mode hors TTY. Et Ink redessine par déplacements de curseur, donc
   lire le flux d'octets rapporte du texte effacé et compte une ligne une fois par
   repaint. Le harnais applique les diffs à une grille de caractères et affirme
   sur la grille.

4. **Le texte et Entrée doivent être deux écritures séparées.** Un pty coalesce
   ce qui est en attente en un seul read, et Ink parse un read comme une seule
   touche : `hello there\r` arrive comme une touche unique dont la séquence est
   toute la chaîne, donc `return` est faux et rien n'est jamais soumis. C'est ce
   qui a coûté le plus de temps à trouver.

## Scénario canonique

Accueil répondu exactement une fois, world mapping, deux workers, un finding, un
Human Delta, une bascule de provider, une direction en direct, puis PROVEN.

## Tailles

80x24, 120x30, 160x50, 240x70. Aucune corruption horizontale, aucun Unicode
cassé, input visible sur la frame finale à chaque taille.

## Non-vacuité

Neutraliser l'identité dans `case "observed"` fait échouer le harnais (5
assertions). Le mutant est restauré à l'octet près.

## Limites

Le scénario est scripté par un producteur fixture : c'est une preuve de
présentation. Aucune preuve de rendu multi-frame, aucune timeline d'animation,
aucun golden visuel n'est revendiqué. Le test complet montre des échecs qui
diffèrent d'un run à l'autre et passent en isolation, ce qui est de la contention
ressources et non une régression.
