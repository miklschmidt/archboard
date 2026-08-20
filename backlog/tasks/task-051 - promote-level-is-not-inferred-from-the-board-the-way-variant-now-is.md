---
id: TASK-051
title: 'promote --level is not inferred from the board, the way --variant now is'
status: To Do
assignee: []
created_date: '2026-08-20 04:21'
labels: []
dependencies: []
references:
  - src/core/promote.ts
  - src/core/board.ts
  - CONTEXT.md
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-040 agent, which fixed the same shape of problem for `variant` and named this one rather than widening its scope.

A board carries a `level` in its identity, from a controlled vocabulary the project grows deliberately (system, service, module). A promotion records a level only if the caller types `--level`. So a node promoted on a board whose level is `service` records no level at all unless somebody remembers.

`variant` had exactly this shape until TASK-040: the board knew the answer, the caller had to repeat it, and forgetting produced a wrong record that surfaced later as noise in `compare`. The fix there was to resolve the default from the board named on the call, since every call names one (ADR 0009).

Whether the same answer is right here needs a moment's thought rather than a copy of the patch. A variant is a property of the board and a node on it cannot sensibly belong to another. A level is arguably a property of the node: a board at `system` might hold a node someone wants recorded at `service`, because the drill-down board for it exists. If that is real, the default should still come from the board and `--level` stays an override, which is what TASK-040 did for variant. If it is not real, level may not belong on a node at all.

Decide which, and say so where the next person will find it.

The skill currently says `--level` records the abstraction tier and is not inferred, so pass it or leave it. That line was written to be true today and will need changing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A node promoted on a board records a level without the caller repeating what the board already says, or level is deliberately not stored on a node and that is written down
- [ ] #2 If the default comes from the board, --level still overrides it
- [ ] #3 The skill matches whichever answer lands
<!-- AC:END -->
