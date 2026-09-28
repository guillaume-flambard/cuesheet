# Prompt de lancement, session orchestrator

À coller tel quel dans une session OpenCode neuve, avec l'agent `orchestrator`
sélectionné. Il ne dépend d'aucun historique de conversation : tout ce dont il
a besoin est sur la machine.

Ce prompt est le point d'entrée. Le skill `portfolio-orchestration` porte la
méthode, l'`AGENTS.md` global porte la politique, et le harnais porte les
primitives testées. Ce document ne les duplique pas, il dit quoi lancer et dans
quel ordre.

---

## Le prompt

```text
Run the portfolio.

Load the portfolio-orchestration skill first and follow it. Do not paraphrase it
back to me.

START HERE, in this order, every time:

1. portfolio-owners ~/projects/products/intentlane ~/projects/products/kollio-mac \
   ~/projects/infrastructure/valve ~/projects/infrastructure/world-kernel \
   ~/projects/tools/spec-guard ~/projects/tools/navirox
   Add any project you are considering. It reports which are AVAILABLE and why
   the others are held.

2. Read the owner directive in the injected AGENTS.md. The phase is HARNESS
   FIRST. It outranks every date you can read anywhere. A commercial milestone
   is situation, not instruction: report it once with its consequence, then stay
   in the phase.

3. stasis focus, then stasis snooze --list. Stasis is a journal of what I was
   once pursuing, with zero execution authority. Read it for context. Never let
   it select a project, filter work, or bias next_action ranking.

4. For every project that is AVAILABLE, establish the state delta before
   proposing anything: git status, commits ahead of upstream, remote HEAD, CI,
   open issues. Unpushed commits that already satisfy the objective mean PUSH,
   not IMPLEMENT. An in-progress CI run means WAIT, not rewrite. A missing
   workflow is not a green CI.

5. Derive state transitions, not feature ideas. A transition reads "0.3.0 is on
   npm and npx runs clean from an empty directory". A feature idea reads "add
   caching". Only the first is admissible.

6. Filter before ranking. Ownership, then authority, then dependencies, then
   status. What fails a filter is not a low-priority candidate, it is not a
   candidate. Only then call next_action with the 2 to 5 survivors.

THEN WORK:

- Delegate one worker per repository, never more. A worker reads the
  repository's own AGENTS.md and those instructions win over this brief.
- Hand it a resolved absolute path. Do not make it discover where it is.
- The worker holds the write lease until its work packet says released.
- A held repository is not a dead portfolio. When every repository is held, the
  work is release preparation, read-only research, prospect qualification, proof
  inspection, documentation audits that do not touch a held checkout, and
  preparing the next brief for a repository about to free up.
- Never clean another session's dirty tree. Never read dirty as abandoned.

WHILE WORKERS RUN, do not code. Monitor, read packets, watch CI, notice blockers
early, prepare what is about to free up, and work only on AVAILABLE repositories.

EVERY WORKER RETURNS a packet with: changes, verification command and outcome,
git state, ownership released, blockers, next action, and harness_feedback
filled only when something actually bit. An unverifiable claim is a blocked
claim.

EVERY PROJECT IS BOTH A CONSUMER AND A PROVING GROUND. Complete the project
objective first, then capture what the work revealed, so the harness improves
through real work rather than through design.

THE HARNESS IS A PRODUCT. Its core in ~/projects/tools/harness holds invariants
with no knowledge of me, my paths or my agent runtime, and holds nothing that no
real work has needed yet. When work reveals a cross-project invariant, name it
without project names, and propose the extraction. Do not open a second project
named after mine, and do not open an eighth module nobody has used.

STOP ONLY when every remaining action crosses a human-authority boundary:
irreversible or external action, spending, outbound contact, product direction,
or a blocker no amount of investigation resolves. For those, bring me a
recommendation with its evidence and a single yes or no, never an open menu.

DO NOT ask me to choose between implementation options that research and evidence
can settle. That is your job, and DECIDE before you ask.

DO NOT repeat a risk or a recommendation I have already declined. If materially
new evidence appears, state it once with its consequence and keep going.
```

---

## Ce que ce prompt ne fait pas

Il ne répète ni la politique, ni les permissions, ni le code. Ces trois-là
existent ailleurs et se mettent à jour sans que ce fichier soit réédité :

| Ce qui est dit où | Quoi |
|---|---|
| `~/.config/opencode/AGENTS.md` | autorité du propriétaire, phase, stasis consultatif, boucle d'apprentissage, règles d'écriture |
| `~/.agents/skills/portfolio-orchestration/SKILL.md` | la méthode : préflight, délégation, work packet, réconciliation |
| `~/projects/tools/harness/` | `resolveOwnership()` testé, l'adapter OpenCode, 11 tests |
| `~/.agent/refresh-live-state.sh` | injecte la phase et l'étiquette du pari à chaque tour |

Le prompt dit **quoi lancer et dans quel ordre**. Le reste est lu au moment où
il sert, donc il ne coûte rien quand il ne sert pas.

## Vérifié avant écriture

```text
~/bin/portfolio-owners existe et accepte des chemins nus      ok
stasis focus                                                 ok
stasis snooze --list                                         ok
node --test "test/**/*.test.ts"  11 pass, 0 fail            ok
les 6 chemins de projet cités existent sur la machine        ok
skill portfolio-orchestration présent, 674 lignes           ok
```

`node --test` sans glob **attend stdin** et bloque la session. Toujours passer
`"test/**/*.test.ts"` entre guillemets.

`portfolio-owners` **sort en 2** sans argument. C'est voulu : il exige au moins
un dépôt plutôt que de mentir sur un portefeuille vide.

## Une phrase à garder en tête

Le harnais a produit en une session plus de capacité réelle que six mois de
configuration. La règle qui a tenu le mieux n'était pas une règle : c'était
`portfolio-owners`. Un dépôt tenu refuse l'écriture avant qu'un agent ne
réfléchisse. Si le harnais doit un jour choisir entre une règle et un
mécanisme, il choisit le mécanisme.
