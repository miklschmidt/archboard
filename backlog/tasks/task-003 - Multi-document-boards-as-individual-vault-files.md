---
id: TASK-003
title: 'Multi-document: boards as individual vault files'
status: To Do
assignee: []
created_date: '2026-08-19 13:55'
updated_date: '2026-08-19 15:24'
labels:
  - needs-triage
dependencies:
  - TASK-002
ordinal: 3000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board can be loaded and saved by name, not one global canvas
- [ ] #2 Board identity lives in frontmatter (board, variant, level)
- [ ] #3 Concurrent-writer behaviour with Obsidian is defined and documented
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:24
---
TWO-WRITER DECISION — needs a human call before implementation.

archboard holds the canvas in memory; the Obsidian Excalidraw plugin holds scene state in memory when a board is open. Neither knows about the other, so last-writer-wins silently eats edits. Note this is not hypothetical: the plugin has a known class of data-loss issues where Obsidian Sync overwrites in-progress Excalidraw edits (zsviczian/obsidian-excalidraw-plugin#1189), with autosave repeatedly implicated. A synced vault is effectively a third writer.

A. Convention only. archboard owns a board while it is open; Obsidian is for reading and prose. Documented, not enforced. Cheapest, and silently loses work when someone forgets.

B. File-watch and reload. archboard watches the board file and reloads on external change. Excalidraw scenes do not merge meaningfully, so this discards whatever the canvas had — trades one silent loss for another.

C. Optimistic concurrency. Record the file hash at load; verify it before every write; refuse and report on mismatch. Prevents nothing, detects everything, never loses data silently. Needs a conflict path (reload / overwrite / save-as).

RECOMMENDATION: C as the mechanism plus A as the documented convention. The hash check is a few lines and turns the failure mode from silent data loss into a visible refusal, which is the only acceptable behaviour for boards a human has hand-arranged. B is a trap.

Not implementing until confirmed.
---
<!-- COMMENTS:END -->
