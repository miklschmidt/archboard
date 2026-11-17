---
status: superseded by ADR-0049
---

# Boards persist as files in an Obsidian vault that spans repositories

Superseded by [ADR
0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md) on
2026-10-14. A vault is now the `.archboard/vault` directory of one checkout, or
of a directory outside any checkout, and its boards can describe any repository.
The logical code references of this decision stay, through ADR 0011.

Boards are stored as `.excalidraw.md` notes in a single Obsidian vault. The
vault spans every repository we work on. It is not inside any one repo.
Architecture work needs board-to-board drill-down, backlinks ("which boards
reference this service?"), and prose alongside the diagrams. A vault gives all
three for free.

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

When the board is presented, board-to-code targets resolve through a
machine-local registry. They do not live in the vault.
