---
status: accepted (provisional)
---

# Boards persist as files in an Obsidian vault spanning repositories

Boards are stored as `.excalidraw.md` notes in a single Obsidian vault that
spans every repository we work on, rather than inside any one repo. Architecture
work needs board-to-board drill-down, backlinks ("which boards reference this
service?"), and prose alongside the diagrams — a vault gives all three for free,
and the drill-down link is already a tappable affordance on the board itself.

Verified before adopting: export is idempotent (two exports byte-identical, so a
vault in git produces clean diffs), import then re-export is byte-lossless, and
Obsidian block references survive the round-trip so human-authored links do not
break.

## Consequences

The vault is not co-located with any repo, so **code references must be logical,
not absolute**: a repository identity plus a path, plus the branch and commit at
which the binding was last confirmed so git history can trace a file that later
moves. Absolute `file://` paths break on any other machine. Each repo keeps its
own `CONTEXT.md` and ADRs where they already are; board-to-code links resolve
through a machine-local registry rather than living in the vault.

## Why provisional

Two blockers, both known and tracked. Export currently destroys custom
frontmatter (TASK-002), which is where board identity is meant to live. And
there is no multi-document support at all — the server holds one global,
unkeyed element map (TASK-003), so "load board X, save board X" does not exist.

The unresolved risk is **two writers**: archboard holds the canvas in memory and
the Obsidian plugin holds scene state in memory when a board is open, neither
knows about the other, and last-writer-wins would silently eat edits. That needs
a defined answer, not a hope.
