---
id: TASK-051
title: 'promote --level is not inferred from the board, the way --variant now is'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 04:21'
updated_date: '2026-08-20 08:32'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decided not to default level from the board, which is the opposite of what TASK-040 did for variant, for a reason the code already carried.

describe shows a node's level only when a board's nodes hold more than one distinct level (showLevel in src/core/describe.ts). The field exists to mark a node that sits at a different tier than its board, which is what a drill-down looks like. Defaulting from the board would stamp every node identically, showLevel would never fire again, and the only signal the field carries would be gone.

A variant is different in kind: a node on payments@option-a cannot sensibly belong to current, so the board's value is the only correct one and a wrong stamp is always a bug. A node's level can legitimately differ.

So an absent level means "same as the board". Nothing is stamped, nothing has to be kept in step, and no reader changes: they either print a level when present or compare it, and both stay correct.

Recorded as ADR 0013, with the rule in CONTEXT.md next to Level, a comment at the promote site, and the skill bullet rewritten to say what the flag means rather than that it is not inferred. Three checks in scripts/check-boards.mjs assert a promoted node takes its board's variant and no level, and records a level when the caller asks for one.
<!-- SECTION:NOTES:END -->
