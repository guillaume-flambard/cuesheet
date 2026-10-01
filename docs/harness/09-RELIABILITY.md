# H09 : durabilité, outils et distribution

## Résultat

Le harness tient ses engagements après incident, reste portable et expose
honnêtement les effets dont l'état est inconnu. Une installation neuve peut
utiliser le produit sans dépendre des chemins de cette machine.

## Stockage

Conserver append-only, séquences, write-through et refus après erreur de persistance.
Versionner manifests, payloads et projections. Définir les migrations avec copies
préservées et compatibilité de lecture. Une ancienne donnée incomplète reste
incomplète ; la migration n'invente ni auteur ni validation.

Définir les garanties exactes entre journal core, vue et artefacts. Réconcilier
après crash entre deux écritures : état produit, présenté, ou présentation non
persistée. La vue reste reconstruisible ; elle ne devient pas une preuve. Enregistrer
les intentions avant les effets et conserver références/digests des résultats.

Le recovery d'un journal endommagé est une opération explicite et inspectable :
conserver l'original, rapporter lignes invalides et dernier préfixe valide, produire
un nouveau journal/recovery report. Ne pas silencieusement supprimer des lignes.
Un disque plein, problème de droits ou lock conflict suspend les nouveaux effets.
Conserver navigation, inspection et export des données encore lisibles.

## Outils et artefacts

Définir une interface injectée de capacités avec effets, scope, préconditions,
timeout/opération, cancellation, schéma d'entrée, limites de sortie et référence
de résultat. Les plans et skills n'élargissent pas les permissions.

Le shell actuel contraint cwd/argv et n'est pas un sandbox. Documenter précisément
ce qu'un programme autorisé peut encore faire. Pour les effets hors scope confié,
appliquer une admission explicite. Préserver des environnements d'outils réduits
quand possible ; ne pas journaliser les secrets. Vérifier chemins, symlinks et
redirections en cohérence avec le threat model. Prévoir les contrôles de nettoyage
de processus et de workspaces sans prétendre à l'arrêt garanti de tout petit-fils.

Les outils d'édition doivent fournir avant/après ou patch, attribution, conflit
et résultat observable. Les fichiers de preuve et critères restent séparés des
zones modifiables par le producteur. Un résultat volumineux n'est pas perdu à
cause de la troncature d'affichage ; sa référence peut être lue progressivement.

## Installation et données

Racines injectables avec defaults XDG/HOME, chemins portables, configuration
documentée, diagnostics de démarrage, export/import des sessions et critères avec
leurs digests. Définir une politique de rétention et de suppression explicite des
artefacts, logs et caches. Aucune collecte distante ou télémétrie implicite.
Tester l'installation packagée dans un environnement temporaire indépendant.

## Acceptation et tâches

- [ ] H09.1 Schémas, migrations et replay des anciennes sessions.
- [ ] H09.2 Recovery explicite et reconciliation core/vue/artefacts.
- [ ] H09.3 Contrats d'outils, outputs complets et arrêt documenté.
- [ ] H09.4 Portabilité, installation, export/import et rétention.
- [ ] H09.5 Injection de pannes, absence de secrets et invariants maintenus.

Tests : fichier tronqué, JSON invalide, disque/droits refusés, writer vivant/mort,
crash entre journaux, conflit de séquences, symlink, secret dans erreur provider,
output volumineux, import ancien schéma, export/import d'une preuve, installation
dans HOME temporaire. Documenter les garanties démontrées et celles hors scope.

Réutiliser `session-store.ts`, `terminal-session.ts`, `effect-receipts.ts`,
`artifact-capture.ts`, `shell.ts`, tests de store/portabilité. Une modification core
exige le contre-exemple reproductible et le respect de CONTRIBUTING.md.
