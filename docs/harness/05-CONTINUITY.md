# H05 : continuité, reprise et budgets

## Résultat

Un objectif continue entre les tranches d'exécution et les renouvellements de
contexte. La personne peut arrêter, reprendre ou changer de direction sans perdre
le savoir. Une session chargée ne relance pas des effets par surprise.

## Contrat de continuation

Séparer objectif durable, exécution, tranche, inférence et appel d'outil. Définir
les transitions de run : actif, en attente d'information, en attente de capacité,
limite atteinte, interrompu, en échec technique, terminé. Les états comportent
cause observée et prochaine action possible.

Pendant une exécution expressément démarrée, la fin d'une tranche peut lancer la
suivante automatiquement si l'objectif reste actif et les budgets le permettent.
Recompiler le contexte et revalider le contrat. Limiter les tranches parallèles
et les dépenses cumulées. Si aucun budget fiable ne peut être mesuré, rapporter
l'incertitude et appliquer un plafond conservateur de ressources/configuration.

Le chargement après redémarrage affiche l'état et les effets incertains. La reprise
automatique au lancement nécessite une préférence explicite persistante. Le mode
par défaut conserve la reprise explicite actuelle. Une interruption humaine
empêche toutes les continuations jusqu'à une reprise humaine. L'absence de timeout
sur l'objectif n'autorise pas une boucle de dépenses infinie.

## Progrès et incident

Mesurer le progrès par observations liées aux critères, résolution de questions,
artefacts et contrôles. Une nouvelle phrase ou une nouvelle spec ne prouve pas
un progrès. Détecter des répétitions de propositions ou échecs équivalents sans
nouvelle information ; rechercher, décomposer, changer de stratégie ou déléguer.
Définir les seuils de détection avec des scénarios observés et les rendre réglables.

Une requête d'effet sans résultat est incertaine. Inspecter le monde avant de
réessayer ; utiliser une clé idempotente quand l'outil la supporte. Ne pas prétendre
à un exactly-once universel. Un effet déjà exécuté peut exiger une compensation
plutôt qu'un second lancement. Les timeouts d'outils, erreurs réseau et fins de
processus sont des observations techniques, pas des échecs du contrat produit.

## Budgets et arrêt

Gérer nombre d'inférences/tranches, tokens estimés ou mesurés, coût quand connu,
concurrence, sorties et délais par opération. Préférences persistantes et override
manuel disponibles ; route par défaut claire sans configuration obligatoire pour
les fonctions locales. Conserver la valeur inconnue quand un provider ne donne pas
son coût, et distinguer coût nul de coût inconnu.

Ctrl+C doit annuler modèle, réseau, outils et workers pilotés. Rejeter les réponses
tardives. Rapporter les processus ou effets dont l'arrêt ne peut être établi.
Une annulation ne constitue pas un rollback de fichiers déjà modifiés.

## Acceptation et tâches

- [ ] H05.1 États et identités d'exécution distincts du cycle de vie d'objectif.
- [ ] H05.2 Continuation automatique bornée entre tranches d'une exécution active.
- [ ] H05.3 Renouvellement de contexte et détection de stagnation.
- [ ] H05.4 Reconciliation des effets incertains avant retry.
- [ ] H05.5 Budgets, arrêt propagé et préférence de reprise au lancement.

Tests : tâche demandant plus de huit inférences ; arrêt au changement de tranche ;
crash avant et après effet ; provider ignorant abort ; objectif ouvert après quota ;
aucun coût inventé ; reprise avec autre modèle ; répétition sans progrès ; nouveau
critère pendant renouvellement ; chargement par défaut sans nouvelle exécution.

Dépendances : H01, H03, H09. Runtime dans les adaptateurs et producteur terminal,
au-dessus de `runAgentLoop`, avec une justification observée pour tout changement core.
