---
id: TASK-061
title: A board note is written without being made atomic
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 20:18'
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
- [ ] #1 A board note is written by rename, so a reader sees the old note or the new one and never a partial
- [ ] #2 The same holds for every writer of a vault note
- [ ] #3 The bytes are flushed to disk before the rename, so a crash cannot leave the new name pointing at a short file
- [ ] #4 The cost is recorded where it can be found: the fsync is over half the measured write budget and is deliberate, not an oversight
<!-- AC:END -->

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
