---
id: TASK-032
title: Board names are case-sensitive keys over a filesystem that may not be
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 23:13'
updated_date: '2026-08-20 03:35'
labels:
  - needs-triage
dependencies: []
ordinal: 32000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two board names differing only in case cannot map to one note without the caller being told
- [x] #2 A vault authored on macOS and opened on Linux, or the reverse, behaves predictably
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision: board names are case-insensitive everywhere, and case-preserving, which is how APFS and NTFS already behave. Boards get named by voice, and a human cannot pronounce casing, so two boards that sound identical must not be able to exist. Recorded as ADR 0010.

1. src/core/board.ts: add normalizeBoardKey (trim, NFC, lowercase) and normalizeBoardName on top of it. Unicode normalisation falls out of the same function, so an accented name authored on macOS as NFD and on Linux as NFC is one board.
2. BoardIdentity.board becomes the normalised key component; a new optional displayName carries the casing a human typed, set only when it differs. boardKey is unchanged, so every existing key comparison keeps holding.
3. validateVariant lowercases. A variant is a slug from a controlled vocabulary, not a title, so there is nothing to preserve.
4. vaultPathFor prefers a note that already exists under any casing, found by walking the vault a segment at a time and comparing normalised names, and falls back to the display casing for a note that does not exist yet. That is what makes 'case-preserving' true on a case-sensitive filesystem.
5. identityFrontmatter writes the display casing; identityFromFrontmatter and identityFromVaultPath read it back. A note whose frontmatter and path differ only in case no longer reports declaredKey, because they are the same board.
6. resolveBoard normalises the key it is given, so ?board=Payments and --board Payments reach the board opened as payments.
7. listBoards reports a collision when two notes in the vault differ only in case, because a vault authored on Linux can hold both and only one of them is reachable. board list says so out loud.
8. Cover both in scripts/check-boards.mjs: names differing in case are one board, board new on a colliding name is refused, an existing note is found under its own casing, and an NFD name matches its NFC spelling.
9. ADR 0010, a CONTEXT.md note if the vocabulary needs one, and the rule in CLAUDE.md next to the addressing rules.

10. Correction to step 4: vaultPathFor always walks, with no byte-for-byte fast path. A fast path made the file a vault with two colliding notes resolves to depend on how the caller spelled the address, which is the one thing the decision forbids.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: case-insensitive everywhere, and case-preserving. Recorded as ADR 0010 (docs/adr/0010-board-names-are-case-insensitive.md). The reason the task did not have is that boards get named by voice, and a human cannot pronounce casing, so two boards that sound identical must not be able to exist. That is a stronger constraint than portability and it points one way; case-sensitive-with-collision-refusal would put the refusal at the only moment it is useless, after the second board already had a reason to exist.

AC1, verified against a canvas server on a random high port:
- 'board new casetest' while the board opened as 'CaseTest' is live is refused 409: Board "casetest" is already open.
- 'board new handover' with only Handover.excalidraw.md on disk is refused 409 and the message names that file, so a collision that is only in casing cannot look like it is about something else.
- Adding, reading and saving under casetest, CASETEST and CaseTest all reach the one board and write the one note.
- A vault that already holds two notes at one address is reported: listBoards sets collidesWith on each, and 'board list' says which one is reachable and to rename the others.

AC2:
- A note written as Payments.excalidraw.md, which is what a Mac leaves behind, is found by the address 'payments' on Linux, opens as that board, and is not reported as declaring a different one.
- A filename written decomposed, which is what macOS has historically done, is found by its composed spelling.
- The file an address resolves to depends only on the key, never on how the caller spelled it: there is no byte-for-byte fast path in vaultPathFor.
- The casing survives the round trip: the note keeps its name and the frontmatter records 'board: CaseTest' while the address stays 'casetest'.

Unicode normalisation did fall out of the same change (NFC in normalizeBoardKey plus the case-insensitive vault walk), so no follow-up is needed for it.

Nineteen checks added to scripts/check-boards.mjs. bun run test exits 0; bunx vite build is clean.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 23:13
---
Found while checking macOS before the user runs there tomorrow. Board keys are case-sensitive strings mapped straight to filenames, with no normalisation. Verified on Linux: `board new casetest` and `board new CaseTest` produce two boards and two notes. On macOS, where APFS is case-insensitive by default, both address one file.

The good news is that this is mostly detected rather than silently destructive, by accident of two earlier decisions:

- TASK-010 hashes a note at load and verifies before writing. `board new CaseTest` has no baseline, so saving onto an existing casetest note is the `unseen` case and gets refused rather than overwriting it.
- TASK-003 surfaces a disagreement between the path and the note's own frontmatter as `declaredKey` instead of reconciling it, so opening `CaseTest` and reading a note that says `board: casetest` reports the mismatch.

So the likely macOS experience is a confusing refusal rather than lost work. That is a decent floor and not a design.

Worth deciding, not just fixing: whether board names are case-insensitive everywhere (normalise on the way in, so the two are one board on every platform), or case-sensitive everywhere (reject a name that collides case-insensitively with an existing note, so a vault stays portable). The second keeps more expressiveness; the first is less surprising. Either beats today, where the answer depends on the filesystem.

Also unchecked: unicode normalisation. macOS historically stores NFD, Linux NFC, so a board name with an accent may not round-trip between them. Same family, lower stakes.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Board names are now case-insensitive and unicode-normalised everywhere, and case-preserving: the address is the normalised form, the note keeps the casing a human typed. Boards get named out loud and a human cannot pronounce casing, so two boards that sound identical can no longer exist on any platform. A note that already exists is found whatever casing it carries, a name that collides only in case is refused with the file named, and a vault that already holds two notes at one address is reported by board list rather than half-reachable. Recorded as ADR 0010 and verified with nineteen checks in scripts/check-boards.mjs plus an end-to-end run through the CLI.
<!-- SECTION:FINAL_SUMMARY:END -->
