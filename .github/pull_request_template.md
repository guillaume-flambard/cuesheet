## Intention et périmètre
- Quel objectif humain et quelle révision ?
- Quelles frontières src/core, adapters, UI, docs sont touchées ?
- Pourquoi ce changement correspond-il à une friction observée plutôt qu'à une fonctionnalité spéculative ?

## Vérification
- [ ] Tests rouges/failures reproduits AVANT le correctif, ou raison documentée
- [ ] Tests exécutés et résultats réels (ne pas recopier une ancienne baseline)
- [ ] Effets externes, états UNKNOWN et reprise considérés si concernés
- [ ] Aucun faux succès ; la validation appartient à un vérificateur indépendant
- [ ] Aucun secret ou privilège supplémentaire
- [ ] Compatibilité des sessions/journaux/revisions traitée
- [ ] Expérience terminal : focus / resize / clavier vérifiés si UI concernée

## Preuves
Commandes, environnement et artefacts observables :

## Risques et questions à reviewer

> Le bot peut préparer ce PR ; merge après checks requis et revue humaine.
