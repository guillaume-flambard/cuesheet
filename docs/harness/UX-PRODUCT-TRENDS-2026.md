# Tendances UX pour Cuesheet, octobre 2026

Recherche effectuée le 3 octobre 2026. Cette note rassemble des motifs observés dans les produits et leurs documentations officielles. Elle ne démontre pas qu'un motif est universellement meilleur. Les décisions Cuesheet ci-dessous sont des propositions à confronter aux contrats existants et aux preuves d'usage. Le master produit et le master design restent les sources d'autorité.

## Ce que montrent les produits consultés

**1. Cibler directement ce que l'on veut changer.** Cursor Design Mode permet de sélectionner un élément, plusieurs éléments ou une zone dessinée, puis d'envoyer cette référence à l'agent avec l'état visuel et le code associé. La documentation explique que ce ciblage spatial enrichit la consigne avec l'identité, les relations visuelles et la capture de l'écran. C'est un exemple produit de réduction de la distance entre « je vois ceci » et « change ceci », pas une étude comparative de précision. [Cursor Design Mode](https://prod.cursor.com/docs/agent/design-mode)

**2. Montrer le travail comme activité structurée.** Linear décrit les états de session d'agent comme travail en cours, attente d'une entrée, erreur ou fin. Son modèle relie les mises à jour d'activité à une session d'agent. Cela illustre des mises à jour orientées vers l'état et la contribution. La documentation ne prouve pas que les vues de suivi Linear conviennent à un terminal global. [Linear Agent interaction](https://linear.app/developers/agent-interaction)

**3. Traiter un résultat important comme un objet réutilisable.** Anthropic décrit les Artifacts comme des contenus autonomes que l'on peut modifier, réviser, réutiliser et exporter. Les mises à jour ciblées et les versions aident à préserver un résultat lorsque le reste de l'échange évolue. La création demeure liée à une conversation chez Claude; cela ne prescrit pas la forme d'un espace de travail terminal. [Anthropic: artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)

**4. Rendre la reprise et la redirection ordinaires.** GitHub documente des sessions persistantes reprenables après pause, redémarrage ou changement de client, avec un identifiant stable et un état chargé à la reprise. OpenAI décrit, pour le travail Codex à distance, de courts points de contrôle où l'utilisateur répond, examine une découverte, change de direction ou approuve la suite. Ce sont des capacités et intentions produit déclarées; elles n'établissent pas la fréquence idéale des interruptions ni la qualité de la reprise. [GitHub Copilot session persistence](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/session-persistence) · [OpenAI: work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/)

**5. Les changements d'état doivent être repérables sans voler le focus.** W3C indique que les messages de statut doivent pouvoir être annoncés aux technologies d'assistance sans déplacer le focus; son interprétation avertit aussi contre l'emploi d'une annonce assertive pour des mises à jour ordinaires. WCAG demande par ailleurs un indicateur visible du focus clavier. Ces critères portent sur le contenu Web, pas directement sur une TUI; les appliquer au terminal est une adaptation de conception, pas une déclaration de conformité WCAG. [W3C, status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages) · [W3C, focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)

## Proposition pour Cuesheet

Conserver une seule surface qui coule avec l'intention et l'arbre de travail. Ajouter à cette grammaire des références manipulables, des états de travail lisibles et des objets d'issue consultables. Cela transpose les motifs observés sans importer panneaux fixes, onglets de projet ou fiches de suivi. La saisie `›` reste l'ancre; elle accepte les corrections pendant l'exécution. Les détails restent accessibles à la demande.

### Carte d'interaction proposée

```text
Intention saisie ou corrigée à `›`
  → compréhension et périmètre visibles
  → travail significatif dans l'arbre, chaque étape avec état observé
  → l'utilisateur cible une ligne, un nœud ou un extrait affiché
  → sa référence est jointe à la prochaine consigne, sans changer de surface
  → le runtime indique reçu, appliqué, en attente de frontière sûre ou bloqué
  → les résultats durables apparaissent comme artefact, décision, preuve ou inconnu
  → pause ou interruption conserve intention, brouillon, point de lecture et révisions
  → reprise donne le delta depuis la dernière vue et un point de continuation
```

Le ciblage direct peut s'appuyer sur une sélection clavier dans l'arbre, un identifiant stable de nœud, ou l'inclusion d'un extrait déjà affiché dans le prompt. Un clic ou une annotation graphique serait seulement une affordance facultative si le terminal et son hôte la prennent en charge. La référence doit rester vérifiable par texte, afin que l'interaction fonctionne sans couleur ni pointeur. Un nœud ciblé apporte contexte et provenance, pas une autorisation d'agir.

L'activité devrait dire ce qui change pour la personne: « vérification du contrat attendue », « correction prise en compte, deux travaux réorientés », ou « suspendu sur une décision ». Elle ne devrait pas imiter les journaux d'outils, inventer des agents ni afficher un pourcentage sans mesure. Un artefact créé depuis la même intention reçoit un nom, un état, une destination connue et un accès à sa version/source. Une preuve reste distincte d'un résultat proposé. Après une interruption, un court repère indique ce qui a changé, ce qui attend, la dernière branche sûre et l'action de reprise; la vue détaillée conserve les sources et l'historique.

## Implications concrètes pour l'acceptation UX

- **Référence dans le prompt:** depuis l'arbre rendu, l'utilisateur peut joindre un nœud ou un extrait à une instruction sans quitter la surface. La consigne affichée permet d'identifier exactement la référence. Après soumission, celle-ci est toujours liée à la révision observée; une référence périmée est signalée et peut être renouvelée.
- **Activité compréhensible:** chaque changement visible reflète un événement réel et distingue au minimum actif, attente d'entrée, échec, terminé et bloqué. La correction affiche son effet réel sur les travaux concernés. En l'absence de changement significatif, aucun faux progrès n'apparaît.
- **Artefact révisable:** une demande de document crée un objet identifiable dans le même fil d'intention. La personne peut l'ouvrir, demander une modification ciblée, voir sa version courante et retrouver sa source; une interruption ne transforme pas une ébauche en résultat vérifié.
- **Reprise sans relecture intégrale:** après pause, redémarrage ou retour d'une inspection, l'intention, le brouillon, le focus et l'ancre de lecture sont préservés. Le résumé de reprise nomme le delta observé, les inconnues, le point sûr et l'action disponible. Une commande de reprise ne relance pas deux fois une opération déjà terminée.
- **Accessibilité et densité:** focus clavier visible et stable; nouveaux statuts textuels annoncés sans déplacer le focus ni saturer les annonces; les glyphes et libellés transmettent le sens sans dépendre de la couleur. Aux tailles canoniques 80×24, 120×30, 160×50 et 240×70, réduire les détails secondaires avant l'intention, l'entrée ou un blocage humain.

Ces critères sont des implications proposées, pas des résultats de recherche déjà vérifiés dans Cuesheet. Leurs échecs doivent être observés sur le terminal livré et avec des scénarios d'interruption réels; une capture statique seule ne prouve ni ciblage, ni reprise, ni annonce accessible. Les connaissances produit citées décrivent des fonctionnalités, et les recommandations W3C décrivent des standards Web. Aucune source consultée n'établit une meilleure disposition universelle pour une TUI d'agents.
