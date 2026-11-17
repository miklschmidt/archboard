---
status: accepted
---

# A board render carries its recipe, and the check keeps embeds current

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces the sections on tracked
embeds and on deleting a board. Git discovers embeds, and no board-owned list of embeds remains.

## Context

Documentation sites embed board pictures. When somebody corrects a board to match the code,
nothing says which pictures in which repositories now show the old board. The picture is often in
another repository than the vault that holds its board.

The code check is also easy to skip. The plain `archboard check` never ran it (ADR 0046). Behind,
the reading of ADR 0045, says how many commits changed a board's bound files after its last change.
It is information and never fails the check.

## Decision

### The check runs every check

`archboard check` runs every check: semantics, code and embeds. Each subcommand runs one. If any
part has a diagnostic or a warning, the command exits 1. Information never changes the exit status.

A documentation repository that embeds the boards of another repository's vault often has no vault
of its own. In a Git checkout without a vault, `check` therefore runs the embeds check alone, and
the exit status comes from it alone.

The route that every open pane polls stays the semantics check. A pane never starts a language
server or a fetch.

A stale board stays a matter of the code check. If code no longer matches a binding, an anchor or a
drawn relationship, its warnings fail the check. Behind stays information, as ADR 0045 decides. A
correct board cannot clear a failure of behind, and such a failure teaches people to make empty
edits.

### A board render carries its render recipe

Every board render, SVG or PNG, carries its render recipe: what it records about how it was drawn.
The recipe names the board, the variant, the view and the drawing choices. It also holds:

- a fingerprint of what the renderer was given
- a hash of the picture as drawn, without the recipe

The recipe holds no output path and no board version. An edit of a variant that the picture neither
draws nor is drawn against raises the version and changes nothing that the picture draws.

An SVG holds the recipe in its `<metadata>` element, and a PNG in a text chunk. A post-processor
that keeps the recipe, such as a font subsetter, leaves the embed checkable. A file without a recipe
is not an embed. SVGO removes `<metadata>` by default, so the documentation says to keep it.

### An embed and when it is outdated

An embed is a board render that a repository keeps under Git. A render that Git ignores is no
embed. An SVG inside an HTML, Markdown or MDX page is no embed either, because `--fix` rewrites a
whole file.

The check draws each embed again from its recipe and compares:

| What the check finds                                      | Severity    |
| --------------------------------------------------------- | ----------- |
| The fingerprint and the picture differ: the board changed | warning     |
| Only the picture differs: the renderer changed            | information |
| Only the fingerprint differs: nothing drawn changed       | none        |
| The board, its variant or its view is gone                | warning     |

Archboard runs from a clone, so two machines can run two commits of the renderer. With a pure
picture hash, one machine marks every embed outdated and the other marks none. The fingerprint makes
the warning mean "the board says something new". `--fix` still draws again what either comparison
finds, so a renderer improvement reaches every picture (ADR 0023).

### A vault in another repository

A recipe names its vault by the repository identity of the vault's checkout. When that repository
has a registered checkout, the check reads its vault as it is. Otherwise it fetches the vault from
the default branch with the person's own git credentials, and caches it by commit. The cache can be
behind the default branch, and an embed can be drawn from a newer commit. So every finding against a
cached vault is information, and `--fix` writes no embed from it. A stale cache fails no check and
draws no embed back to an older picture.

## Considered options

- **A list of embeds in the vault configuration or a manifest file.** The list must be kept in step
  with the files by hand. A recipe in the file moves with the file, and a deleted file stops being
  checked.
- **Compare the file's bytes.** A font subsetter or another post-processor then marks every embed
  outdated.

## Consequences

- The semantics check, which the panes poll, still reads no code and no Git. The full
  `archboard check` reads Git and can reach the network.
