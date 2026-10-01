---
status: accepted
---

# Boards persist as files in an Obsidian vault that spans repositories

Boards are stored as `.excalidraw.md` notes in a single Obsidian vault. The
vault spans every repository we work on. It is not inside any one repo.
Architecture work needs board-to-board drill-down, backlinks ("which boards
reference this service?"), and prose alongside the diagrams. A vault gives all
three for free. The drill-down link is already a tappable affordance on the
board itself.

These properties were verified before the vault was adopted:

- Export is idempotent. Two exports are byte-identical, so a vault in git
  produces clean diffs.
- Import then re-export is byte-lossless.
- Obsidian block references survive the round-trip, so human-authored links do
  not break.

## Consequences

The vault is not co-located with any repo, so code references must be logical,
not absolute. A code reference is a repository identity plus a path. It also
carries the branch and commit at which the binding was last confirmed. With
them, git history can trace a file that later moves. Absolute `file://` paths
break on any other machine.

Each repo keeps its own `CONTEXT.md` and ADRs where they already are. When the
board is presented, board-to-code targets resolve through a machine-local
registry. They do not live in the vault. Human-authored board and web links
remain ordinary Excalidraw links, and they are preserved.

## Status note

The ADR was originally recorded as provisional pending two blockers. Both are
now closed. Export preserves custom frontmatter (TASK-002). Boards are
addressable, persisted vault notes (TASK-003). Both were verified idempotent and
byte-lossless.

ADR 0006 settles the two-writer risk. It chooses detection over prevention. When
Archboard reads a note, it hashes it. Before it writes, it makes sure that the
hash still matches. If the file changed underneath, it refuses the save
(TASK-010).

"Prose alongside the diagrams" is real rather than aspirational since TASK-017.
A save regenerates the scene and nothing else. Markdown that a human writes
above the `# Excalidraw Data` section, or below the Drawing block, is carried
across verbatim. Both round-trip properties above still hold with that markdown
in place.
