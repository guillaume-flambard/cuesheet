# Contexte borné : tranche applicative

`shared-context.ts` impose un plafond sur le frame JSON sérialisé : 48 000
caractères UTF-16 par défaut, override `CUESHEET_CONTEXT_CHARS` (minimum 4 000),
ou option injectée `contextBudgetChars` du producteur. Ce plafond est distinct
d'une fenêtre de tokens provider, dont la négociation reste dans H07.2.

Les politiques répétées sont dédupliquées, les observations historiques et autres
records facultatifs sont limités, puis réduits au besoin. L'historique récent est
borné à 32 événements. Les directives humaines actives, mémoires humaines actives
et le contrat courant sont conservés. Si les éléments indispensables dépassent le
plafond, l'inférence est refusée avec une cause explicite ; rien d'autoritaire
n'est silencieusement supprimé. Le frame donne les nombres d'omissions et la plage
de séquences du journal. L'estimation de tokens affichée est une borne conservatrice
par caractères, pas un tokenizer provider ni une mesure de coût.

`read_history {from,to}` récupère au plus 100 événements par page et borne la sortie
JSON à 12 000 caractères. La pagination donne `next`. Un événement volumineux
donne un `dataExcerpt` de son JSON encodé, `nextOffset` et `totalChars` ; la lecture
`{from:seq,to:seq,offset:nextOffset}` permet de récupérer les fragments suivants
sans perdre le contenu original. Les lectures ne modifient pas le journal.

La reconstruction reste une projection, sans résumé ajouté comme fait. Les sources
antérieures, proofs et artefacts restent inspectables dans le journal. Le contexte
local conserve le texte original de l'intention et distingue l'interprétation du
modèle, ses critères proposés et le check déclaré épinglé.

Régressions : journal de 10 000 observations avec contrainte humaine ancienne,
plafond de 16 000 caractères, compilation déterministe sans mutation, récupération
de sources omises, dépassement d'autorité refusé, pagination et recomposition JSON
complète d'un record de 10 000 caractères. Aucune inférence réelle n'est utilisée
dans ces tests. La mémoire multi-projet et les tokenizers spécifiques restent ouverts.
