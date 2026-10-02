# EV-UI-THEME-CONTRACT

2026-10-02. Branche `ui-theme-contract`, base `2d7261b`. Un seul fichier de
code : `test/ui-theme-contract.test.ts`. Aucun fichier de `src/**` ni de
`apps/terminal/src/**` n'est modifié.

## La demande et sa lecture

`apps/terminal/src/theme/tokens.ts` énonce sa propre règle dans son docstring et
ne la fait vérifier par rien. Neuf couleurs sont définies contre une phrase qui
en autorise huit. Le travail demandé n'était pas d'écrire la règle, elle existe
déjà, mais de la rendre impossible à contourner sans le vouloir.

La palette n'est donc pas réécrite et aucun sélecteur de thème n'a été ajouté. Un
choix de couleur reste une décision de produit ; ce fichier décide seulement si
la décision a été prise exprès.

## Mesures, et pourquoi celles-là

Toutes les assertions sont dérivées des valeurs RGB réelles de la palette, jamais
d'une paire de littéraux hexadécimaux écrite en dur. Un test qui affirme « ces
deux littéraux diffèrent » est un commentaire porteur d'un `assert`, et il cesse
d'être vrai dès que quelqu'un édite l'un des deux.

### Mesure 2 : luminance relative, pas distance RGB

Règle : `contrast(confirmed, unknown) >= 1.5`, vérifié en précision pleine puis
sur une grille 4 bits par canal.

Le choix de la luminance relative est défendu dans le fichier. Un terminal
truecolor émet la valeur 24 bits et l'écran l'affiche telle quelle, donc la
question honnête est ce que l'œil sépare. La luminance relative est le modèle
standard de la clarté perçue, et c'est la grandeur dont la formulation d'accessibilité
de ce dépôt est écrite. La distance euclidienne RGB n'est pas perceptuellement
uniforme : elle pèse les canaux linéairement alors que le sRGB ne l'est pas, et
elle ne distingue pas une couleur devenue plus sombre d'une devenue plus bleue.

Le seuil de 1.5 est une constante nommée comme telle dans le fichier. À ces
luminances, un rapport de 1.5 vaut environ 13 unités de L\* CIE, bien au-delà du
point où deux marques sur le même fond cessent d'être confondues d'un coup d'œil.
La paire mesurée est à 1.75 en pleine précision, soit 18.0 unités de L\*, et à
1.55 une fois quantifiée en 4 bits. Le seuil est donc volontairement sous la
mesure : l'assertion porte sur une propriété que la palette possède, pas sur une
propriété qu'elle possède à peine.

La clause 4 bits n'est pas décorative. Un terminal qui demande 4 bits par canal
arrondit, et une palette qui ne sépare ses deux états que sur le dernier bit
d'un canal n'a rien séparé. Recherche sur l'espace RGB : 16 944 couleurs
passeraient le seuil en pleine précision et échoueraient une fois arrondies. Une
seule suffit à le prouver, `rgb(0x66, 0xc3, 0xcd)` passe à 1.501 puis tombe à
1.329, et le test échoue sur la seconde clause seule.

### Mesure 4 : saturation, pas luminosité

Règle : `saturation(active) >= 1.5 x saturation(confirmed)`, plus `distance(confirmed, text) < distance(active, text)`.

Chroma et non luminosité, et ce n'est pas un choix de confort. Ce qui fait qu'une
 ligne crie est la quantité de couleur qu'elle porte, pas sa brillance, et sur un
fond sombre les deux canaux vont en sens opposés. Le fait mesuré dont dépend
cette assertion : `active` est plus SOMBRE que `confirmed` (0.388 contre 0.547) et
nettement plus saturé (0.958 contre 0.494). Toute assertion formulée en
brillance affirmerait l'inverse de l'intention.

La seconde clause est la même relation vue de l'autre bout, et c'est celle que vit
la personne qui lit la frise. `text` est la couleur de toute ligne ordinaire,
donc une couleur proche d'elle se lit comme ordinaire. Mesuré : `confirmed` est à
96 unités de `text`, `active` à 113.

### Mesures 1 et 5 : la forme et l'exhaustivité

Règle 1 : les clés de `theme` sont exactement les quatre valeurs de `Certainty`,
plus un accent, plus les quatre gris. Aucune clé sans rôle. Chaque gris est vérifié
sur son étendue de canaux, pas sur son nom, parce qu'un gris qui a dérivé vers le
chromatique est une cinquième couleur portant le nom d'un gris.

Seuil d'étendue : 32. Mesuré, les gris de la palette s'étalent de 14 à 28 unités et
ses couleurs chromatiques commencent à 86. Le vide est large, le seuil à l'intérieur
est une mesure.

Règle 5 : application totale et injective sur les quatre `Certainty`. Totale pour
qu'une certitude ne puisse arriver sans marque, injective pour que deux
certitudes n'en partagent pas une, ce qui laisserait la couleur seule porteuse de
la différence. Chaque marque doit rendre un grapheme unique et non un mot, compté
avec `Intl.Segmenter` pour la raison que `components/editor.ts` donne.

L'union `Certainty` est relue comme texte dans `app/state.ts`, et non dérivée de la
constante du test, pour deux raisons. La transcription du test peut vieillir, et
l'union de `app/state.ts` fait autorité. Et comme le fichier n'ajoute aucune
dépendance runtime sur un module qu'un autre worker édite, il échoue quand même le
jour où une cinquième certitude apparaît, parce que la palette doit alors une
cinquième couleur d'état à la surface. C'est ici que cela se voit.

## Ce qui violait la règle, et qui n'a pas été touché

Trois constats. Aucun ne justifie de changer une couleur dans un fichier de test.

**`brand` et `confirmed` sont la même valeur octet pour octet.** Les deux valent
`rgb(0x7d, 0xd3, 0xc0)`. Le docstring dit que `brand` est le nom du produit et que
rien d'autre ne l'utilise, et la mesure d'usage donne `brand` 7 et `confirmed` 3.
Le nom du produit est donc peint exactement comme une certitude établie, sur la
ligne la plus lue de l'écran. Ce n'est pas une violation de « une seule couleur
d'accent », c'est un accident du nommage : rien dans la palette ne distingue le
logo d'un travail terminé. Trouvé, non corrigé, parce que séparer les deux est une
décision de produit et qu'on ne sait pas laquelle des deux couleurs doit changer.

**`dim` et `unknown` sont aussi la même valeur.** Les deux valent
`rgb(0x8b, 0x93, 0xa7)`. Le docstring dit de `unknown` « Grey, and marked with a
distinct glyph », ce qui est cohérent et assumé. Mais cela veut dire qu'une
certitude non établie et un texte secondaire sont indiscernables à la couleur, et
que seule la marque porte la différence. L'assertion 2 ne le couvre pas et ne
devrait pas : c'est le comportement voulu. Elle couvre la paire qui compte,
`confirmed` contre `unknown`. Le fait reste écrit ici pour que personne ne le
découvre en production.

**Six fichiers écrivent un glyphe en littéral au lieu de le lire dans `glyph`.**
`components/Composer.tsx`, `components/Header.tsx`, `overlays/AgentModels.tsx`,
`overlays/Models.tsx`, `overlays/Palette.tsx`, `overlays/Sessions.tsx`, plus
`producer/index.ts`. Ce sont des caractères de traits et le chevron, jamais une
couleur. C'est une observation sur le même canal que la règle énoncée pour les
couleurs, et elle est signalée dans le fichier de test pour qu'elle ne se perde
pas, mais elle n'est pas transformée en échec : décider lesquels de ces littéraux
deviennent des jetons est un changement de composants, hors du périmètre d'un
fichier de test. Le test enregistre la liste et échoue si elle grandit.

## Scan des littéraux de couleur : ce qui a été trouvé

`apps/terminal/src` entier, comments retirés, palette exclue par chemin et non
par liste de formes autorisées. Résultat au moment de l'écriture : **rien**. Zéro
littéral hexadécimal, zéro appel `rgb()` ou `hsl()`, zéro couleur nommée, dans tout
`apps/terminal/src` hors `theme/tokens.ts`.

L'ensemble d'enregistrement `inkColor` que la palette tient pour Ink est bien
présente, et il vit dans le fichier de la palette. Il est exclu parce que le
fichier de la palette est le chemin de l'exception, pas parce qu'on lui a accordé
un passe.

Une nuance signalée pour exactitude : deux composants écrivent un caractère de
traits en littéral, `Header.tsx:23` et `Composer.tsx:62`, tous deux avec
`theme.rule` comme couleur. Ce n'est pas une couleur, c'est un glyphe, et il est
compté dans le constat sur les glyphes ci-dessus.

## Non-vacuité, assertion par assertion

Cinq mutations, chacune sur la palette ou la carte de glyphes, chacune restaurée
octet pour octet et vérifiée par sha256.

| Assertion | Mutation | Résultat |
|---|---|---|
| 1 | ajout de `warning: rgb(0xff, 0x88, 0x00)` à `theme` | ÉCHEC ×2 : « the palette must have exactly one accent, found ["brand","warning"] » et « these palette keys have no role » |
| 2 | `confirmed` ramené vers `unknown` (`rgb(0x7d, 0xb8, 0xb0)`) | ÉCHEC : « contrast at 1.370, the floor is 1.5 » |
| 2, clause 4 bits | `confirmed: rgb(0x66, 0xc3, 0xcd)` | ÉCHEC sur la seconde clause seule : « at 4 bits per channel they contrast at 1.329 » |
| 3 | `overlays/Help.tsx` : `inkColor(theme.dim)` remplacé par `"#8b93a7"` | ÉCHEC : « overlays/Help.tsx:13 #[0-9a-fA-F]{3,8}\b in <Text ... color={"#8b93a7"}> » |
| 4 | `active` rendu désaturé (`rgb(0x8f, 0x9c, 0xb8)`) | ÉCHEC : « active is only 0.45x as saturated as confirmed, the floor is 1.5 » |
| 5 | `glyph.unknown` remplacé par `"✓"` | ÉCHEC : « two certainties share a glyph: ["✓","◇","✓","×"] » |
| 5 | `glyph.confirmed` remplacé par `"ok"` | ÉCHEC : « confirmed renders as 2 marks, not one » |
| 5, exhaustivité | union `Certainty` simulée avec un cinquième et un troisième membre | La fonction de lecture rend bien 5 et 3 valeurs, aucun égal à la liste de quatre |

Restauration vérifiée : `tokens.ts` sha256
`26d9c0d574272eb88df02eff4efa34de3086dc5c72b1cb896e330171a214421d` avant et après
les six mutations, `Help.tsx`
`ef305b1eaf379bfe9fe6561f9798d57958e36bb8f4d3f65d3d4afc0ad06fac42` avant et après.

## Preuves d'exécution

`node --test test/ui-theme-contract.test.ts` : 14 tests, 14 pass, 0 fail.

Voisin inchangé, pour montrer que le fichier n'a rien déplacé :
`node --test test/surface-v2.test.ts` : 33 tests, 33 pass, 0 fail.

Comptes de compilation, inchangés :

- `npx tsc -p apps/terminal/tsconfig.json --noEmit` : **3**, les trois nommés et
  préexistants, `src/adapters/shell.ts(58,5)`, `src/core/memory.ts(234,5)`,
  `src/core/store.ts(268,22)`.
- `node_modules/.bin/tsc -p tsconfig.build.json` : **32**.

La suite complète n'a pas été lancée, d'autres workers tournant en parallèle.

## Limites assumées

Le test lit `app/state.ts` comme texte pour l'union `Certainty`. C'est une
dépendance de forme, pas de module : un reformatage de cette ligne par un autre
worker ferait échouer le test alors que la sémantique n'a pas bougé. Le motif
tolère les retours à la ligne, il ne tolère pas un changement de nom.

Les seuils 1.5 et 1.5 sont des constantes choisies, nommées comme telles dans le
fichier, avec leur mesure à côté. Elles sont sous la mesure, volontairement, pour
qu'un ajustement de palette ordinaire ne bute pas dessus et pour qu'un ajustement
qui rabot la distinction bute.

Enfin, ce fichier ne juge aucun couple de couleurs. Il juge qu'un rôle existe, qu'un
seuil tient, qu'aucun littéral n'entre par la fenêtre. Le reste est à décider par un humain.