# Recherche et skills : intégration actuelle

La production terminal raccorde `read_document`, `search_web`, `list_skills` et
`read_skill`. Le modèle décide de les appeler à partir de l'intention et des
observations ; aucun mode recherche ou commande utilisateur n'est nécessaire.

## Lecture publique

`read_document {url}` lit HTTPS public sur port standard, avec destinations DNS
vérifiées puis connexion TLS à l'adresse épinglée et SNI du domaine d'origine.
Les URL credential, destinations privées/locales et redirections vers celles-ci
sont refusées. Trois redirections maximum, 256 KiB maximum, délai de 15 secondes,
abort et rejection des résultats tardifs. Les formats acceptés sont texte, HTML,
JSON et XML ; les formats binaires/compressés non supportés produisent un refus.

La source complète capturée, l'URL finale, le type, l'empreinte et la date sont
persistés sous `terminal.research`. L'extrait d'outil est borné ; `read_history`
retrouve les fragments omis. La source garde le statut non fiable et ne modifie
ni l'objectif ni l'autorité du check. Les métadonnées sont dans le frame borné.

Essai réseau réel réalisé le 2026-10-01 : lecture de
`https://nodejs.org/api/documentation.html`, HTTP 200, text/html, 27 984 caractères,
digest `3aead6107cf02f9e2fef52440fd0fd94cbee14bb791e13bd97a1ba0c642f3ca9`.
Ce résultat prouve une lecture HTTPS réelle, pas un choix pertinent de modèle,
une extraction parfaite du HTML ou la sécurité de toute destination possible.

## Recherche

Route implémentée : `CUESHEET_SEARCH_PROVIDER=brave` avec `BRAVE_SEARCH_API_KEY`.
Une clé seule n'active aucune route. Sans configuration, le résultat indique la
capacité manquante et permet encore la lecture d'URL directe. Les paramètres
query/header suivent la [documentation officielle Brave](https://api-dashboard.search.brave.com/api-reference/web/search/get),
consultée pendant l'implémentation. Pas de clé dans les notes ou résultats ;
erreurs HTTP sans corps reflété ; résultats maximum cinq avec `read:false`.

La requête accepte au plus 600 caractères/75 mots ; l'auth reste dans le header
du seul endpoint configuré. Les snippets sont des pistes et non des pages lues.
Le transport Brave est testé sur fixture, pas avec un abonnement réel configuré.
Version pertinente et contrôle des citations finales restent
à réaliser avant de clôturer H04.1/H04.3.

## Skills installés

Racines explicites via `CUESHEET_SKILL_ROOTS` (séparateur de chemins de la plateforme),
ou racine projet `.cuesheet/skills`. `list_skills` découvre les manifests et versions
à l'instant de l'appel ; `read_skill {name}` charge le contenu ciblé et garde path,
digest, référence de journal et limite de lecture. Un nom ambigu, manifeste trop
gros, illisible ou symlink hors racine est signalé sans importer ses instructions.
`SkillsAdapter` vérifie désormais les frontières avant de lire le manifeste.

Les racines illisibles restent distinctes d'une bibliothèque vide. Les contenus
référencés sont récupérables par `read_history`. Les instructions de skills ne
changent pas les permissions ou critères et les skills locaux générés demeurent
des instructions de session. Leur essai/promotion/rollback H04.5 reste ouvert.

## Vérification requise avant clôture

La suite couvre adresses locales/mappées, credentials URL, redirection privée,
abort/timeout ignorant signal, sources complètes et versions de skills, lecture
paresseuse, frontières symlink et whitelist d'environnement du launcher. Les
intégrations provider réel, citations et
parcours de modèle réel restent ouverts dans le graphe canonique.

Intégration vérifiée : test/surface-verification.test.ts lit un skill et un document injecté, vérifie leur présence à la prochaine inférence, écrit answer.txt via un processus Node réel puis obtient une preuve du check épinglé. Cela vérifie le raccordement, pas la qualité d’un modèle réel.

### Fraîcheur implémentée dans H04.3

read_document accepte maxAgeMs (0 par défaut, plafond 24 heures). Une capture complète du même URL, datée et dont le hash correspond encore au contenu, peut être réutilisée dans cette fenêtre. Aucun append ni accès réseau sur hit ; sortie explicite cached, fetchedAt, ageMs et sourceSeq. maxAgeMs=0 force une nouvelle lecture. Horloge future, capture invalide ou cache périmé déclenchent une lecture ; un échec de rafraîchissement ne présente pas l’ancien contenu comme actuel. Nouvelle capture conserve previousSourceSeq et changed. Test redémarrage avec nouvel adapter sur le même journal, péremption, changement de contenu, hash corrompu, options invalides.

### Tranche H04.2 : sources locales

read_document accepte exactement url ou path. path est relatif à une racine locale explicitement injectée (cwd au runtime) ; realpath reste dans cette racine. Texte UTF-8 strict, fichier régulier de 256 KiB maximum ; fichiers secrets usuels et répertoires .git/node_modules exclus. Lecture asynchrone cancellable, source complète datée/hashée avec chemin réel ; aucun réseau ni cache ancien. Tests traversée, symlink, format binaire, taille, cancellation, ambiguïté url/path et attribution.
