# Installability, measured

The three claims this repository makes about portability, and what holds.

```text
PORTABLE     the code does not depend on the machine it was written on   PROVED, P0
INSTALLABLE  someone can install it without reading the source            PROVED, here
PUBLISHABLE  we are ready to promise it works on their machine            NOT PROVED
```

## What was measured

```text
source TS -> tsc -> dist/ -> npm pack -> install in a temp HOME -> run
```

`test/install.test.ts` does exactly this, every time the suite runs, and asserts
two things rather than one:

- the installed package runs, from the installation, with a `HOME` that is not
  the developer's and a `PATH` that contains only node;
- it carries **no executable `.ts`**, which is the assertion that matters. A
  package can execute perfectly while still depending on the TypeScript it must
  not need, and that only fails on a machine without the checkout.

The library surface is probed too, nine modules imported from `dist/`, because a
package whose CLI works and whose exports do not is installable in a very narrow
sense.

## The cause, and why it was not obvious

Raw `.ts` shipped, so any npm install hit Node's type-stripping wall under
`node_modules`:

```text
ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
```

Node will strip types from a file it launched directly and refuses to do so for a
file it resolved inside `node_modules`. The tests never saw it, because they
always launch `src/*.ts` directly. The build is `tsc` and three layout fixups it
cannot perform itself, each asserted before the build is allowed to succeed: no
shebang emitter, dispatcher filenames held as string data rather than import
specifiers, and `version()` reading `package.json` from a directory that the
output moved.

## The build that was judged unnecessary

The previous audit concluded that closing INSTALLABLE needed a build step, and the
working rules say not to add machinery without a real case. The audit **was** the
real case, and it was recorded rather than acted on at the time, which is what it
was for.

The alternative was not obviously better. A one-line change in `src/cuesheet.ts`
would have removed the need for the fixup the build script argues about most, and
that file is not the build script's to own. It is still an open question, not a
settled one.

## What this does NOT prove

- **The checkout was not moved away.** Moving it is not something a test should
  do to the developer's working tree, so the strongest available proof was used
  instead: the child environment contains four named variables and none of them
  is a path into this repository, and the installed package contains one
  occurrence of the checkout's path, in `README.md`, which is not executed.
- **PUBLISHABLE is a different claim.** A package that installs and runs is not a
  package anyone should depend on. The difference is a support burden, not a
  build step, and no amount of testing here would close it.
- **34 type errors remain** in the type check the build runs. The build emits
  despite them and asserts its own three fixups, so `dist/` is complete and the
  entry points dispatch. They are pre-existing, they are not in the shipped path,
  and they are recorded here rather than hidden. Closing them is its own work.

## Numbers

| Measurement | Value |
|---|---|
| Tarball | 74 files, 118 KB |
| Executable `.ts` in the installed package | 0 |
| Modules imported from `dist/` | 9/9 |
| Type errors in the build's check | 33 |


## Terminal interactif packagé (2026-10-01)

Le test initial ne lançait que --version, sessions et les exports. H09.4a reproduit son angle mort : dist/apps/terminal manquait. scripts/build-terminal.mjs livre désormais un bundle ESM Node, Yoga WASM et les notices de 37 dépendances ; aucun import package externe restant dans le metafile. Le launcher installé utilise le Node courant ; le checkout garde TSX. Les devtools optionnels Ink sont exclus du bundle de livraison par une adaptation contrôlée de leurs gardes.

L’oracle d’installation contrôle les assets et le diagnostic non-TTY, puis un test PTY démarre le paquet dans une racine/home indépendants, entre une demande, reçoit la fixture locale et quitte proprement. Aucune TS exécutable, runner de checkout, clé réelle ou modèle live ne participe à ce scénario. Runtime testé : Node 24 sur macOS ; target de bundle Node 22, pas un essai de toutes les versions/OS. La branche PTY est explicitement ignorée si expect est absent. PUBLISHABLE reste non revendiqué et H09.4 export/import/rétention reste incomplet.
