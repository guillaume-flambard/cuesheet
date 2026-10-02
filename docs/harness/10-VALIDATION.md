# H10 : preuves de qualité et remplacement du workflow

## Résultat

Établir que Cuesheet accomplit le parcours demandé, maintient ses garanties avec
des modèles de capacités différentes et remplace le workflow quotidien sur un
périmètre mesuré. Ne pas confondre présence de fonctionnalités et qualité démontrée.

## Niveaux de preuve

1. Contrats déterministes : transitions, révisions, provenance, refus, persistence.
2. Intégrations réelles locales : shell, capture, check, processus multiples, terminal.
3. Intégrations réseau explicitement configurées : providers, recherche, documents.
4. Évaluations répétées avec modèles réels et oracle commun.
5. Dogfood sur une feature réelle, interruption et reprise différée.

Un modèle scripté prouve les niveaux 1 à 2 selon les adaptateurs utilisés. Il ne
prouve pas l'intelligence du processus. Un « exit 0 » d'un test choisi par le
producteur n'est pas automatiquement l'oracle du benchmark.

## Corpus

Créer un corpus versionné avec jeux de données/captures, contrats et checks gelés
hors des workspaces producteur. Couvrir : bug simple, feature multi-fichiers,
documentation dépendant d'une version, spec ambiguë résoluble, correction en
cours, contexte long, agent remplacé, crash et effet incertain, tâche non-code,
skill utile créé puis réutilisé, absence de capacité et critère adversarial.

Pour chaque tâche : conditions initiales identiques, résultat attendu indépendant,
outils et autorisations, limites de ressources, cas cachés si pertinents, règle de
réussite et mode de jugement. Protéger les checks contre les modifications du
producteur. Rapporter les tâches exclues et les raisons.

## Comparaison

Comparer au moins deux modèles réels de capacités différentes dans Cuesheet, et
le workflow OpenCode de référence sur les tâches comparables. Vérifier versions
et configurations au moment de l'essai. Fixer les budgets avant les runs. Répéter
au moins trois fois les tâches critiques pour un premier rapport ; conserver les
runs ratés. Publier réussite, coût connu/inconnu, tokens, temps, interventions
humaines, reprises, outils, violations du contrat et qualité des sources.

Les checks de justesse et d'autorité doivent rester stricts pour tous les modèles.
L'effort, le coût et le taux de réussite peuvent différer. Après un pilote, fixer
les seuils de latence, contexte et qualité dans un manifeste d'évaluation versionné
avant le run confirmatoire. Une absence de données empêche de déclarer une
supériorité ; elle ne doit pas être transformée en résultat nul.

## Gate de remplacement

Pour déclarer le périmètre prêt : parcours sans modes manuels ; contrats corrigibles ;
mémoire durable et sourcée ; reprise/changement de modèle ; recherche attribuée ;
skills utilisables ; agents partageant l'état ; validation indépendante ; erreurs
et budgets lisibles ; terminal utilisable ; installation reproductible. Le rapport
liste ce qui est prêt, partiel, absent et hors du périmètre déclaré.

## Acceptation et tâches

- [ ] H10.1 Corpus, manifeste, oracles et capture des traces.
- [ ] H10.2 Rapports par niveau de preuve et diagnostics de régression.
- [ ] H10.3 Runs répétés faible/fort modèle et référence OpenCode comparable.
- [ ] H10.4 Dogfood réel avec correction, crash et reprise différée.
- [ ] H10.5 Rapport de remplacement avec seuils, limites et instructions d'installation.

Les checks requis à chaque tranche sont les régressions qui échouent sans la
modification, le garde différentiel TypeScript, les tests appropriés et le diff
check. La suite complète valide l'intégration avant commit. Conserver les
diagnostics existants visibles ; ne pas élargir leur baseline pour masquer un
nouveau problème.

Dépendances : corpus initial immédiatement ; runs confirmatoires après les fonctions
concernées. Les preuves historiques restent dans `docs/EVIDENCE.md` et les rapports
de tranche ; un nouveau résultat porte sa date et son commit.

## Pilote modèle gratuit — H10.3a

Un cas réel avant benchmark confirmatoire : BinaryModelAdapter/--pure, opencode/big-pickle explicitement choisi, HOME neuf sans config/key owner et small_model identique. Tarification gratuite vérifiée dans https://opencode.ai/docs/en/zen/ au2026-10-02 ; liste locale contient ce modèle. Pas de fallback paid, pas de changements préférences. Projet Git temporaire non confidentiel : clamp(value,min,max) actuellement faux, test projet et oracle hors projet épinglés sur bornes, intérieur/négatifs/input ; modifications humaines/stagées préservées. Goal naturel exige workspace, code/tests/revue/intégration/finish ; budget2slices×8steps fixé avant essai, timeout par inférence90s. Modèle propose, conteneur Linux exécute, owner check indépendante ferme. Identités[] empêchent routage vers vrai portfolio. Tout résultat/échec et trace conservés sous root du pilote ; métriques temps/calls/bytes, tokens/coût connus ou inconnus explicitement. Un pilote réussi ne clôt pas H10.3/4 ni ne prouve supériorité, autonomie long terme ou selfhost complet. Si échec : enregistrer cause, créer défaut requis avant correction, ne pas changer l'oracle pour obtenir une réussite.
