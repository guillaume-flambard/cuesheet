# H04.5a/H06.1c — skills des consultants

Intention : le harness fournit automatiquement aux rôles leurs instructions pertinentes, avec version/source visibles dans Agents. Réutiliser découverte/lecture existantes et create_skill session. Aucune permission nouvelle ni rôle obligatoire.

Flux : consult_agents → frame courant + rôles/tâches → sélection bornée des noms de skills installés et skills session latest → lecture via SkillTools (source durable/hash) ou référence note session → snapshot par agent → instructions non fiables dans contexte → réponse texte → contrôle de fraîcheur des versions → proposition sourcée. Contrôleur seul écrivain, aucun choix arbitraire de chemin.

Sélection locale initiale : recouvrement des tokens nom avec rôle/tâche ; skills session ajoutent rationale. Trois maximum par agent, contenu6000 caractères au total, trois appels maximum déjà bornés. Pas de prétention sémantique universelle ; métriques retrieval/promotion H04.5/E01.7 restent ouvertes. Version entière hachée, contenu tronqué signalé, source complète retrouvable au journal. Collisions nom installed ambigues refusées par loader existant. Absence pertinente explicite ; roots illisibles signalés, ne deviennent pas absence prouvée.

Contrats : sources {name,kind,version,sourceSeq,truncated}. Skills session seulement issus de notes terminal.work operation skill avec sources existantes et bornes ; attribution model, pas de promotion automatique. Manifest installed via loader root/realpath/hash borné. Changement de version/source pertinente pendant inférence rend la réponse stale. Contenu ne peut accorder outils/droits/provider/autorité de vérification, code worker toujours consultation texte et tool requests refusés. Contexte humain conserve autorité.

AC-H04.5/H06.1/H06.4/H06.5 tranche : rôles distincts reçoivent skills distincts, create_skill reçu par prochain agent, sourceSeq/hash précis, manifeste absent/ambigu/modifié/symlink horsroot refuse/honest limitation, changement pendant inférence refuse ancien résultat ; attaques instruction/tool sans effet ; versions visibles dans palette et lecture pure/reload ancien agent. Tests filesystem/producer/current context/Ink existant+source fields/typeguard/full/build.

Graphe : H04.5a P1 sélection/lecture/version/fraîcheur → H06.1c P1 raccordement consultation/UI. Parents skills essais/revue/promotion/rollback, agents code et comparatif restent ouverts. Risques : lexical non exhaustif, grands manifests tronqués, données non fiables, races host/R06 et secrets arbitraires/R09 toujours ouverts. Auth réseau/sync/deployment/worktrees N/A lot. Performance candidate scan borné100,3skills/6000caractères, historique append-only ; older agent notes sans skills lisibles ; rollback ignore champs optionnels ; aucun I/O UI. Pas de global goal timeout.


## Bibliothèques externes par projet (opt-in, 2026-10-13)

Le runtime accepte une bibliothèque de skills **sans installation/copie** et sans
l'accorder aux autres produits. À l'invocation de Cuesheet, fixer **les deux**
variables suivantes à des chemins absolus :

```bash
CUESHEET_SKILL_PROJECT=/chemin/absolu/vers/le-projet \
CUESHEET_SKILL_ROOTS=/chemin/absolu/vers/memo-founder-skills/skills \
  cuesheet
```

Lancer depuis le projet identifié. Les roots externes ne sont visibles que
lorsque la portée sélectionnée correspond exactement à
`CUESHEET_SKILL_PROJECT`. Sans cette correspondance, Cuesheet utilise la
racine locale `.cuesheet/skills` du projet, **jamais** la bibliothèque externe.
Si `CUESHEET_SKILL_ROOTS` est défini sans `CUESHEET_SKILL_PROJECT`, le
runtime refuse cette configuration, plutôt que d'exposer silencieusement la
bibliothèque aux projets voisins. Plusieurs bibliothèques autorisées peuvent
être séparées par le délimiteur de chemins du système.

Les consultations utilisent `consult_agents` (champ `skills` optionnel,
maximum 3 noms), puis `selectAgentSkills` et `SkillTools` :
nom, empreinte SHA256, source journalisée et contrôle de fraîcheur sont
conservés. L'absence, l'ambiguïté, l'illisibilité et le changement de version
restent explicitement observables. Le lecteur ne donne aucune permission
supplémentaire. Les agents de consultation ne disposent d'aucun outil.

**Limitations actuelles :** la sélection automatique par recouvrement lexical
ne reconnaît pas toujours une mission formulée en français face à des skills
nommés en anglais. Pour un pilote déterministe, passer les noms explicites :
`evidence-verification`, `opportunity-qualification`,
`product-launch-readiness`. Les sessions de travail dont le scope a changé
vers un worktree différent ne bénéficient pas implicitement de l'opt-in
externe ; cela devra être admis explicitement lors d'un futur chantier.
