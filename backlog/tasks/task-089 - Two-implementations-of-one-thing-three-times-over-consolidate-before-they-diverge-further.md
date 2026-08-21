---
id: TASK-089
title: >-
  Two implementations of one thing, three times over: consolidate before they
  diverge further
status: To Do
assignee: []
created_date: '2026-08-21 12:53'
labels: []
dependencies: []
references:
  - src/core/board-io.ts
  - src/core/board.ts
  - src/core/expand-elements.ts
  - src/server.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: task
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Not a suspicion. Three instances, each found by evidence rather than by reading for smells, and one of them has already cost a bug.

**1. One arrow, two gaps.** `expand-elements` builds a binding recording `gap: 4`. `resolveArrowBindings` routes that same arrow with a local `const GAP = 8`. Two numbers for one distance, and neither knows about the other. TASK-088 covers the arrow-routing half of this; the duplication is the reason it was possible.

**2. Two ways to read a note.** `readBoardFile` in `src/core/board.ts`, and `readNote` / `readBoardContent` in `src/core/board-io.ts`. Stage 8 made the second one the path every request takes and left the first as the open path. TASK-085 had put its wikilink resolution in the first. The two merged cleanly, git reported no conflict, and a board the Obsidian plugin had migrated rendered holes on every read — caught only because check-boards happened to cover it, and repaired by hand afterwards. **This is what the duplication costs: a correct change to one path silently not applying to the other.**

**3. Two ways to expand elements.** `expandElementsForExport` and `expandForBoard`, both exported from `src/core/expand-elements.ts`. They may be legitimately different jobs. They may also be the thing ADR 0015 names outright: 'There is one implementation of that conversion, shared by everything that needs it, rather than one per side that are meant to agree.' That needs establishing rather than assuming, either way.

## What the survey did NOT find

Worth recording so this stays scoped. Every named numeric constant in `src/` appears exactly once — no duplicate definitions — and the timing family is already gathered into `src/core/timing.ts` by TASK-066. Repeated bare literals in the element and geometry paths turned out to be ADR numbers and HTTP statuses in comments. So this is not a codebase littered with magic numbers; it is a small number of parallel implementations, which is a different and more dangerous problem because a check passing on one path says nothing about the other.

## Why now is not the moment

Recorded deliberately. This wants doing between features, not during one — the mutex work (TASK-067, TASK-080) is still to land and touches the write path that instance 2 lives in. Consolidating underneath it would mean resolving the same merges twice.

The precedent for how to do it is already here: TASK-061 deleted `repo-registry`'s hand-rolled temp-file-and-rename rather than leaving a second idiom to go stale, and the one that survived gained an fsync the other never had.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One arrow's gap is defined once and both the binding and the routing read it
- [ ] #2 There is one path that reads a note, and the open path and the per-request path are the same code
- [ ] #3 Whether the two expansion functions are one job or two is established and written down, and if one, they are one function
- [ ] #4 Each consolidation is proved by reverting it and counting which checks fail, not by the suite staying green
<!-- AC:END -->
