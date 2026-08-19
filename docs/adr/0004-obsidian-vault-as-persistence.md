---
status: accepted
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

## Status note
Originally recorded as provisional pending two blockers, both now closed:
export preserves custom frontmatter (TASK-002) and boards are addressable,
persisted vault notes (TASK-003) — verified idempotent and byte-lossless
across both.
The two-writer risk is settled by ADR 0006, which chooses detection over
prevention: archboard hashes a note when it reads it, verifies that hash before
writing, and refuses the save when the file changed underneath (TASK-010).
"Prose alongside the diagrams" is real rather than aspirational since TASK-017:
a save regenerates the scene and nothing else, so markdown a human writes above
the `# Excalidraw Data` section — or below the Drawing block — is carried across
verbatim, and both round-trip properties above still hold with it in place.
