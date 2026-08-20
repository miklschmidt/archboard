---
id: TASK-061
title: A board note is written without being made atomic
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 22:04'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/repo-registry.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - src/core/library.ts
priority: high
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

src/server.ts around 2690 writes a board note with a bare writeFileSync. A crash, a full disk or a process killed mid-write leaves a truncated note.

Truncation fails loudly on the next read, which is the good half: cutting a real note at 10, 50, 95 and 99.9 percent all throw "No Drawing block found" rather than loading a partial board. The bad half is that the board is then gone, and the note is the only copy once it has been saved.

src/core/repo-registry.ts around 116 already writes atomically with a temp file and a rename, so the pattern exists in this codebase and is not being used for the thing that matters most.

The investigating agent tried to measure the race window with a two-process stat probe and saw zero torn reads in 8.4 million attempts for both the plain and the rename versions. They were explicit that this proves nothing about the hazard, only that it is narrow, and reported it from the mechanism instead. That is the right reading: rename is atomic by contract, writeFileSync is not, and a vault is a directory other programs watch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board note is written by rename, so a reader sees the old note or the new one and never a partial
- [x] #2 The same holds for every writer of a vault note
- [x] #3 The bytes are flushed to disk before the rename, so a crash cannot leave the new name pointing at a short file
- [x] #4 The cost is recorded where it can be found: the fsync is over half the measured write budget and is deliberate, not an oversight
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/core/atomic-write.ts: one writeFileAtomic(file, bytes) that writes a hidden sibling temp file, fsyncs the data, renames over the destination, and unlinks the temp on failure. Temp name is a dotfile with a .tmp suffix so a vault never shows it and listBoards never matches it.
2. Point every writer of a vault note at it: the board save in src/server.ts, the library in src/core/library.ts. Fold src/core/repo-registry.ts's own rename onto the same helper so there is one idiom.
3. Record the cost where it is found: a header comment on the helper naming the 5.15-5.25 ms of the 6.21 ms cycle and that it is deliberate.
4. Prove atomicity rather than correctness in scripts/check-boards.mjs: hold a read fd and a second hard link across a save and assert both still hold the whole old note, assert the destination's inode changed, assert no temp file is left in the vault and board list does not see one.
5. Check ADR 0006 still holds across the rename: baseline recorded from the bytes written, a note changed underneath still refused.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed as src/core/atomic-write.ts: writeFileAtomic(file, data) opens a hidden sibling temp file, writes, fsyncs the data, closes, renames over the destination, then best-effort fsyncs the directory. A failure unlinks the temp and rethrows, so the destination is left as it was.

Three writers point at it: the board note save in src/server.ts, the vault library in src/core/library.ts, and src/core/repo-registry.ts, whose own temp-file-and-rename it replaces so there is one idiom rather than two.

The temp name is `.<basename>.<pid>.tmp`. A dotfile, so listBoards skips it before it reaches the .excalidraw.md test and Obsidian does not show it, and a .tmp suffix so nothing walking a vault by extension can take it for a board.

ADR 0006 is unaffected. The destination is never opened for writing, so what lands at the path is exactly the bytes that were hashed, and recordBaseline still records the hash of what was written. The refusal path is untouched: the conflict check happens before any temp file exists, and a refused save still creates nothing, empty directories included. check-boards still proves the changed-underneath refusal per board.

Proof is in scripts/check-boards.mjs, and it is about the window rather than the contents. A save is made with an open read fd and a second hard link held across it, and both still hold the whole old note afterwards while the path has a new inode. Reverting src/server.ts to fs.writeFileSync fails 4 checks: the held fd (reads 3322 bytes of new note where 1861 were expected), the hard link, the inode, and the static check that the three modules use the shared helper. Removing the fsync alone fails 1: the order check, which patches fs.fsyncSync and fs.renameSync and asserts fsync lands first.

Validation: bun run test green, 18 suites, exit 0.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:09
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: sequencing changed. Filed as tidy-up; it is now a prerequisite.

Nothing about the mechanism changed. `src/server.ts:2691` is still a bare
`fs.writeFileSync(file, bytes)`, and `src/core/repo-registry.ts:116` still
shows the temp-file-and-rename pattern this codebase already has.

What changed is what a torn write costs. Today the note is a copy: memory holds
the board, and a truncated note means the last save is lost while the canvas
still has the work. Under ADR 0015 the note is the only copy, so a truncated
note is the board, gone. That is the difference between "the last save is lost"
and "the board is lost".

It also changes how often the hazard is exposed. `docs/design/stateless-server.md`
counted 9 explicit saves in 25 hours against 370 human change reports. Under
ADR 0015 every one of those 370 is a note write, so the window is entered
roughly 40 times more often.

Two things this task should now say that it did not:

- `fsync` before the rename, not just the rename. A rename is atomic with
  respect to readers, but a crash before the data reaches disk can still leave
  the new name pointing at a short or empty file on some filesystems. This is
  not free: `docs/design/server-is-the-truth.md` measures the whole
  read-modify-write cycle at 6.21 ms for 55 elements and 9.75 ms for 300, of
  which the fsync-and-rename write is 5.15 to 5.25 ms and does not vary with
  size. So over half the write budget is this task's cost, it is known, and it
  was accepted when ADR 0015 was accepted. Nobody should later "optimise" it
  away without reopening the ADR.
- Every writer of a vault note, not only the board save. `src/core/library.ts`
  writes `<vault>/.archboard/library.excalidrawlib`, and the scratch board gets
  a home in the same directory under ADR 0015. Acceptance criterion 2 already
  says this; it now has more writers to cover.

Sequencing: stage 6 of docs/design/the-plan.md, alongside TASK-060, before the
stage that makes every write a note write. Priority raised to High for that
reason.
---

created: 2026-08-20 20:18
---
Correction to the comment above: the stage number was written before the plan was finalised. This is stage 8 of docs/design/the-plan.md, not stage 6. The sequencing it describes is unchanged: before TASK-078.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A vault note is written by rename, not by truncate-and-fill. src/core/atomic-write.ts holds the one implementation — temp file, fsync, rename, directory fsync — and the board save, the library and the checkout registry all use it; repo-registry's hand-rolled version is gone. The temp file is a dotfile with a .tmp suffix, so it is invisible to listBoards and to Obsidian. ADR 0006's hash check is unchanged, since the bytes hashed are exactly the bytes that land at the path. Proved in scripts/check-boards.mjs by holding a read fd and a second hard link across a save: both still hold the whole old note, and the path has a new inode. Reverting to fs.writeFileSync fails 4 checks; dropping the fsync fails 1. The fsync cost (5.15-5.25 ms of a 6.21 ms cycle) is recorded in the module header and in CLAUDE.md as deliberate. bun run test green.
<!-- SECTION:FINAL_SUMMARY:END -->
