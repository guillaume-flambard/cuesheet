# EV-CAPSULE-TEARDOWN

2026-10-02. H09.1c, AC-H09.1-capsule-teardown, REQ-H09.1. Le teardown du test
capsule reel ne depend plus d'un delai suppose : il attend la liberation reelle
du montage par le moteur, et echoue bruyamment si elle n'arrive pas.

## L'ecart

`test/node-capsule.test.ts`, test reel `real capsule dependencies...`, terminee
par `rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100})`.
Ce teardown est non deterministe : il echoue en `ENOTEMPTY` sur l'arbre
temporaire, en isolation jamais, sous charge de suite complete souvent. Le
fichier passe 3/3 seul et casse le releve de toute suite.

## La cause reelle

Ce n'est ni un processus fils qui tient l'arbre, ni une ecriture de conteneur
qui continue, ni une course `rmSync` entre l'arbre et lui-meme. Les trois sont
ecartees par mesure.

Le mecanisme tient en un point de `src/adapters/container-tools.ts`. Pour chaque
racine bind montee, le runner cree `<root>/.cuesheet` sur l'hote (ligne 108) puis
monte un masque par-dessus ce chemin dans le conteneur (lignes 104 a 119). Ce
`.cuesheet` est donc un point de montage cote conteneur, dans un arbre partage
avec l'hote par virtiofs. `DELETE /containers/<nom>?force=1` (ligne 144) repond
204 avant que cette liberation soit visible de l'hote : le `rmdir` hote frappe le
point de montage masque, echoue, et le parent remonte `ENOTEMPTY`.

Les mesures qui etablissent la chaine :

1. Aucune resurrection. Dans le cas reel en echec, le residu est toujours
   exactement `existing-workspace/.cuesheet`, un repertoire vide en mode 700, et
   aucune entite n'apparait apres le debut de la suppression (birthtime compare
   au debut du parcours). L'hypothese d'une ecriture tardive du VM qui recree des
   entrees est donc fausse.
2. Aucun conteneur survivant et aucun processus present au moment du teardown :
   `docker ps -a --filter name=cuesheet-tool-` ne rend rien. La VM Docker Desktop
   tient pourtant bien l'arbre : `com.apple.Virtualization.VirtualMachine`
   (`ps -o comm` sur le PID rendu par `lsof`) porte des descripteurs de
   repertoire sur `work` et `work/.cuesheet` apres le `rm -f` du conteneur.
3. Temoin sans Docker. Le meme arbre de forme identique, construit sans moteur et
   sans bind, supprime proprement 8/8 sous la meme concurrence de 8. Ce n'est
   donc pas une course `rmSync` sous charge.
4. Latence de liberation mesuree. Delai entre la suppression du conteneur
   acknowledge par le moteur et l'instant ou l'arbre hote devient supprimable :
   0 ms en isolation, et sous 8 processus concurrents min 162 / p50 251 /
   max 348 ms. Sur le chemin reel en echec, l'arbre redevient supprimable 22 a
   108 ms apres le premier echec (p50 85 ms).
5. Pourquoi les options existantes ne sauvent rien. `maxRetries:3,
   retryDelay:100` offre en apparence environ 300 ms, mais l'appel echoue en 2 a
   7 ms : Node n'a pasengage ce budget sur cet `ENOTEMPTY`. Comparaison
   entrelacee, 8-way, 4 tours par bras, meme charge pour les trois :
   `maxRetries:3` echoue 27/32, `maxRetries:10` echoue 0/32,
   `maxRetries:200` echoue 0/32.

Avant correction, la meme reproduction donnait 38/40 echecs a 8-way.

## La correction

`test/node-capsule.test.ts` uniquement. Aucun fichier de `src/`, aucun helper
partage a creer, aucune modification de `docs/harness/` existant.

Un helper local `removeReleasedTree(root)` remplace le `rmSync` du teardown reel :

- il n'absorbe que les codes `ENOTEMPTY` et `EBUSY`, la condition prouvee, et
  relance toute autre erreur ;
- il attend la liberation par sondage de 20 ms, plafond 2000 ms. Ce n'est pas un
  delai suppose : la boucle sort des que l'arbre est supprimable, donc elle ne
  coute que le temps de liberation reel (2 a 6 itérations observées) et zero dans
  le cas nominal ;
- le plafond est dimensionne sur la mesure, pas choisi au jugé : 2000 ms pour un
  pire cas observe de 348 ms a 8-way ;
- si le plafond est atteint, il leve une erreur nommant la racine et le residu.
  Le comportement precedent laissait fuire le repertoire temporaire en silence.

Le test `owner immutable image metadata...` garde son `rmSync` : il parle a un
faux serveur Unix, ne monte aucun bind, et n'est pas expose a cette cause.

## Preuves

Dix executions consecutives de `node --test --test-reporter=spec
test/node-capsule.test.ts`, avec `CUESHEET_TEST_CAPSULE_IMAGE` (digest
`sha256:358569078158...`, label `node-v1`, typescript 5.9.3) et
`CUESHEET_TEST_TOOL_SOCKET=/Users/memo/.docker/run/docker.sock` : 10/10 exit 0,
`tests=3 pass=3 fail=0 skipped=0`, aucun ENOTEMPTY, compte de tests identique a
chaque execution.

Sous charge, avant et apres sur le meme stress (test reel seul, 8-way) :

| avant | 38/40 echecs |
| apres | 0/40 echecs |

Et en durcissant : 0/48 a 16-way, puis 0/24 a 12-way.

Aucune fuite apres correction : 0 repertoire `cs-capsule-real-*` cree apres le
correctif. Les 41 repertoires temporaires restants sont anterieurs au correctif et
n'ont pas ete supprimes, d'autres workers pouvant lancer le meme test.

Typing : `tsc -p tsconfig.build.json` compte exactement 32 `error TS`. Le
`tsconfig.build.json` n'inclut que `src/**/*.ts`, donc ce changement, limite a
`test/`, ne peut pas deplacer ce compte.

Sans les variables d'environnement, le test reel reste en skip et les deux autres
passent, comme avant : le portillon n'a pas bouge.

## Portee et suite

Les autres tests a conteneur reel partagent la meme fragilite latente, avec la
meme `rmSync` en teardown : `test/container-tools.test.ts` (10 occurrences, dont
les tests reels), `test/capsule-verification.test.ts`,
`test/worktree-build.test.ts`. Non touches ici, hors perimetre du fichier
assigne. `test/container-tools.test.ts` et
`test/capsule-verification.test.ts` sont deja en `maxRetries:10`, ce qui est le
seul endroit ou le budget Node s'applique, mais le helper explicite reste la seule
forme qui n'atolere ni une fuite silencieuse ni un budget opaque.

 Cote runner, une amelioration possible consisterait a ne pas promettre la fin
d'un effet avant la liberation observee, mais c'est un changement de contrat de
`ContainerToolRunner`, hors perimetre et non requis par cet AC.