# EV-MULTI-WORKER-CRITERIA

2026-10-02. Réconciliation canonique des dix critères multi-worker référencés par
les tâches et absents de la collection `acceptance` de state.json. Signalés par
[INTENT-MAP-ADAPTIVE](../intent-map-adaptive/evidence.md), qui exigeait la
réconciliation avant toute clôture.

## Ce qui a été trouvé

Les dix critères ne sont pas des spécifications manquantes : leur texte
autoritatif existe dans [MULTI-WORKER.md](../../MULTI-WORKER.md). Six sont
définis dans le tableau de tranche, lignes 34 à 39 ; quatre dans des sections
dédiées, `AC-H06.2b1` ligne 75, `AC-H06.2c1` ligne 92, `AC-H06.2c2` ligne 115 et
`AC-H06.3c2a` ligne 155. Aucun n'existait dans `state.json.acceptance`.

Le défaut était donc une absence de mise en miroir, pas une absence de
spécification. Conséquence mesurée avant correction : cinq tâches marquées DONE
(`H06.2a`, `H06.2b1`, `H06.2c1`, `H06.2c2`, `H06.3c2a`) portaient un critère que
le magasin canonique était incapable de voir. Toute vérification de clôture
lisant `acceptance` ne pouvait pas les couvrir.

## Ce qui a été fait

Les dix entrées ont été ajoutées verbatim depuis MULTI-WORKER.md, rattachées à
`REQ-H06.2` comme le déclare OPENCODE-ORCHESTRATION.md lignes 156 à 165, et
ajoutées au tableau `acceptance` de cette exigence pour que la résolution soit
bidirectionnelle. Le texte est repris caractère pour caractère, y compris la
ponctuation d'origine : un critère recopié qui différerait de sa source créerait
une nouvelle dérive, ce qui est précisément le défaut corrigé.

Aucun PASS n'a été inventé. Les dix entrées sont `PENDING`. Quatre portent
l'identifiant de preuve existant qui les couvre déjà (`EV-CODE-WORKER-FOUNDATIONS`
pour `2b1` et `2c1`, `EV-TERMINAL-CODE-WORKERS` et `EV-CODE-COMPOSITION` pour
`2c2`, `EV-CODE-COMPOSITION` pour `3c2a`) : la trace est attached, la vérification
reste à faire. Les six autres n'ont aucune preuve et restent sans identifiant.

Répartition des tâches sous-jacentes, inchangée : cinq DONE bornés par leur
preuve, cinq TODO dans une chaîne stricte `H06.2b` puis `H06.2c` puis `H06.4a`
puis `H06.3c2` puis `H06.5c`. MULTI-WORKER.md est cohérent avec cela, qui déclare
les parents H06.2, H06.3, H06.4 et H06.5 ouverts (lignes 61, 119 et 159). Aucun
parent n'a été clôturé sur la preuve d'un enfant.

## Second défaut trouvé pendant la même passe

Sept références de preuve portées par des tâches DONE ne résolvent pas dans la
collection `evidence`, qui compte 43 entrées. Six sont des chemins de fichiers
plutôt que des identifiants : `evaluation/worktree-integration/evidence.md`,
`evaluation/worktree-build/evidence.md`, `evaluation/installed-selfhost/evidence.md`,
`evaluation/workspace-provider/evidence.md`, `evaluation/automatic-isolation/evidence.md`
et `evaluation/owner-capsule/evidence.md`. La septième est `EV-WORKER-PACKETS`.
Les six fichiers existent bien sur disque. Le défaut est donc une convention de
référence qui mélange deux formes, plus un identifiant réellement absent. Il
n'est pas corrigé ici : le remplir exigerait de recopier un résultat et une
méthode depuis chaque fichier, ce qui doit être fait à partir de leur contenu et
non depuis le seul statut de la tâche. À traiter avant toute clôture de parent
concerné.

## Vérification

Contrôle d'intégrité complet après correction : zéro référence pendante dans
les deux sens, exigence vers critère et critère vers tâche. Ce qui était
dix références de critère pendantes est désormais nul. `counts.acceptancePending`
passait de 83 à 93, mesuré et non supposé ; `requirements`, `p0_open` et `p1_open`
étaient déjà fidèles. JSON valide et stable en aller-retour, diff whitespace
propre, 160 insertions et 2 suppressions, entièrement additif hors le compteur.

Aucun changement de comportement applicatif : cette passe ne touche que le
magasin canonique et ses invariants.

## Limites

Réconciliation de surface, pas vérification de conformité. Rien ici ne prouve
que l'un des dix critères est satisfait ; dix sont `PENDING` et le restent tant
qu'une preuve ne les couvre pas. Le second défaut reste ouvert. Les statuts de
tâche n'ont pas été modifiés : cette passe n'ajoute ni ne retire de travail, elle
rend seulement visible ce qui était invisible pour la clôture.
