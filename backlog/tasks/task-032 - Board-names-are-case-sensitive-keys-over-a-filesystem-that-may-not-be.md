---
id: TASK-032
title: Board names are case-sensitive keys over a filesystem that may not be
status: To Do
assignee: []
created_date: '2026-08-19 23:13'
updated_date: '2026-08-19 23:13'
labels:
  - needs-triage
dependencies: []
ordinal: 32000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two board names differing only in case cannot map to one note without the caller being told
- [ ] #2 A vault authored on macOS and opened on Linux, or the reverse, behaves predictably
<!-- AC:END -->

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
