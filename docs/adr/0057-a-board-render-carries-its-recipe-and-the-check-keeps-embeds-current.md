---
status: accepted
---

# A board render carries its recipe, and the check keeps embeds current

Decided by the repository owner on 2026-10-24, in a design interview. It serves
TASK-526 and its subtasks.

## Context

Documentation sites embed board pictures. A person or an agent changes code,
the code check says that a board no longer matches it, and somebody corrects
the board. Nothing then says which pictures in which repositories now show the
old board. `semantic render --out` writes an SVG and prints a receipt with the
board, the version and the variant, but the file records none of it. The
picture is often in another repository than the vault that holds its board.

The code check is also easy to skip. The plain `archboard check` never runs it
(ADR 0046), and the CI of this repository does not run it either. Behind, the
reading of ADR 0045, already says how many commits changed a board's bound
files after its last change. It is information and never fails the check.

## Decision

### The check runs every check

`archboard check` and `archboard check all` run every check. Each subcommand
runs one:

| Command                     | What it reads                                                         |
| --------------------------- | --------------------------------------------------------------------- |
| `archboard check semantics` | the vault's boards against its configuration (the former plain check) |
| `archboard check code`      | the code check of ADR 0046, with behind                               |
| `archboard check embeds`    | the embeds of this checkout and the tracked embeds of this vault      |

The answer has one part for each check, and a subcommand fills only its own
part. If any part has a diagnostic or a warning, the command exits 1.
Information never changes the exit status. `--variant`, `--every-draft` and
`--plan` belong to `check code`, `check` and `check all`. `--fix` belongs to
`check embeds`, `check` and `check all`, and the other subcommands refuse it.
With `check --fix`, the other checks still run and report. The flag `--code`
is removed, with no alias.

The route that every open pane polls stays the semantics check. A pane never
starts a language server or a fetch.

A stale board stays a matter of the code check. If code no longer matches a
binding, an anchor or a drawn relationship, its warnings fail the check.
Behind stays information, as ADR 0045 decides. A correct board cannot clear a
failure of behind, and such a failure teaches people to make empty edits.

### A board render carries its render recipe

Every board render, SVG or PNG, carries its render recipe: what it records
about how it was drawn. The recipe holds:

- the board's `id`, with its name for messages only
- the variant by id, or "current" for a render that named no variant, so that
  the render follows an adoption
- the view by id, the variant drawn against, and the drawing choices: theme,
  layout, legend and title, and for a PNG its scale and region
- a fingerprint of what the renderer was given: the drawn variant without its
  walkthroughs and the code that it cites, the variant it is drawn against,
  the view, the board's level, the vault's presentation policy and the title
  text
- a hash of the picture as drawn, without the recipe

The recipe holds no output path and no board version. An edit of a variant
that the picture neither draws nor is drawn against raises the version and
changes nothing that the picture draws.

An SVG holds the recipe in its `<metadata>` element, and a PNG in a text chunk.
A post-processor that keeps the recipe, such as a font subsetter, leaves the
embed checkable. A file without a recipe is not an embed. SVGO removes
`<metadata>` by default, so the documentation says to keep it.

A render on stdout carries the recipe too, so stdout and `--out` give the same
bytes. An SVG render defaults to `--theme auto`. A PNG cannot follow the
reader's colour scheme, so `rasterize` defaults to `dark`. Both `render` and
`rasterize` draw a horizontal legend by default, and `--no-legend` turns the
legend off.

### An embed and when it is outdated

An embed is a board render that a repository keeps under Git. `check embeds`
reads the files that Git tracks in the checkout that it runs in. Each SVG
document and each PNG with a recipe is an embed. A render that Git ignores is
no embed. An SVG inside an HTML, Markdown or MDX page is no embed either,
because `--fix` rewrites a whole file.

The check finds the board by the recipe's `id` in the vault that the recipe
names, draws it again from the recipe and compares:

| What the check finds                                      | Severity    |
| --------------------------------------------------------- | ----------- |
| The fingerprint and the picture differ: the board changed | warning     |
| Only the picture differs: the renderer changed            | information |
| Only the fingerprint differs: nothing drawn changed       | none        |
| The board, its variant or its view is gone                | warning     |

The fingerprint covers the whole drawn variant, also the parts that a view
leaves out. So an edit outside the view moves the fingerprint and leaves the
picture as it was. Such an embed is current, and `--fix` only writes its new
recipe.

Archboard runs from a clone, so two machines can run two commits of the
renderer. With a pure picture hash, one machine marks every embed outdated and
the other marks none. The fingerprint makes the warning mean "the board says
something new". `--fix` still draws again what either comparison finds, so a
renderer improvement reaches every picture (ADR 0023).

When the board is gone, the warning names the commit that removed it, from the
vault's Git history, when the check can find it. When a board now holds the
deleted board's name, the warning says so. If the recipe asks for "current"
and the overview or Everything, `--fix` then points the recipe at that board.
It does not for other recipes, because the ids of the old variant and view do
not exist on the new board. The
answer lists every embed that `--fix` drew again or pointed at another board.
Nothing points at a new board without that line.

### Tracked embeds

`semantic render --out <file> --track` makes a tracked embed: the board lists
the embed as `{ repo, path }`, the shape of a binding without the code fields.
The list belongs to the board, not to a variant, because a recipe can say
"current". The recipe stays in the file, so one copy of it exists.

`--track` is a board write. It takes the lease, an agent states `--doing`, and
the version rises. It does not move the last change of ADR 0045, because it
changes nothing that a board says about the code. If no registered checkout of
the vault's repository exists, or the output file is in no Git checkout, the
CLI refuses `--track`.

In the vault's repository, `check embeds` also reads each tracked embed of its
boards. An outdated tracked embed in another repository is information there,
not a warning. A warning fails the vault's pull request until the other
repository draws the embed again. That repository reads the vault's default
branch. So it can draw the embed again only after the pull request merges, and
each side then waits for the other. `--fix` draws a tracked embed again only in a registered
checkout, and otherwise the answer names it.

A move (ADR 0051) carries the list with the note. The target vault's check
then names each tracked embed whose recipe still names the old repository, and
`--fix` rewrites the recipe. A rename needs nothing to find the board, because
former names answer forever and the recipe names the board by id. A title
without words names the board, so a titled picture shows the old name after a
rename. The check then reports it outdated, and `--fix` draws the new name.

### A vault in another repository

A recipe names its vault by the repository identity of the vault's checkout.
When that repository has a registered checkout, the check reads its vault as
it is, as a binding reads its checkout. Otherwise it fetches the whole
`.archboard/vault` directory of the default branch, shallow and sparse, with
the person's own git credentials. A render reads the vault's configuration and
the levels of the boards that its nodes stand for, so one board file is not
enough. The fetch is cached in the state directory by commit. Offline with a
cached copy, the check uses the cache and says so as information. Offline with
no cached copy, a failed fetch is a warning that names the repository.

### Deleting a board

`archboard semantic delete <board>` removes the whole note. It follows the
rules of every other write: the lease, `--doing` for an agent and
`--expect-version`. It refuses while a node on another board opens the board,
and the refusal names those boards. It does not refuse for tracked embeds: its
answer lists them, and their own check then names the deleting commit. A
delete frees the name and the former names. The browser offers no delete.

## Considered options

- **Behind fails the check.** A board that an agent read and found correct
  then needs a "checked" marker to clear the failure. ADR 0045 rejected that
  marker, and the reasons still hold.
- **A list of embeds in the vault configuration or a manifest file.** The list
  must be kept in step with the files by hand. A recipe in the file moves with
  the file, and a deleted file stops being checked.
- **Compare the file's bytes.** A font subsetter or another post-processor
  then marks every embed outdated.
- **A board version in the comparison.** A draft edit or a walkthrough edit
  then marks embeds outdated that draw nothing new.
- **Refuse a delete while tracked embeds exist.** The embeds can be in a
  repository that the person cannot change.
- **A forwarding record for a moved board.** ADR 0051 rejected it. The board's
  own list carries the context to the target vault.
- **The words "artifact" and "tracked render".** An embed is what a document
  shows, and the check exists for documents. "Artifact" also covers talk
  folders and videos, and nothing checks them.

## Consequences

- ADR 0045, ADR 0046 and ADR 0054 are amended where they name `check --code`
  or the plain check. Their other decisions hold.
- The semantics check, which the panes poll, still reads no code and no Git.
  The full `archboard check` reads Git and can reach the network.
- A board document gains one optional board-level list. The schema version
  does not move, as for `formerNames` and `documents`.
- Every SVG that this build draws differs from one drawn before, because it
  carries a recipe and follows the reader's colour scheme.
- The README's render-based SVGs become tracked embeds, and the README shows
  the feature on itself.
