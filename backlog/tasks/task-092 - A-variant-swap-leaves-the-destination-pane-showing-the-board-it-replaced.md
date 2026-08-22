---
id: TASK-092
title: A variant swap leaves the destination pane showing the board it replaced
status: To Do
assignee: []
created_date: '2026-08-22 15:40'
labels: []
dependencies:
  - TASK-081
references:
  - src/server.ts
  - docs/adr/0012-a-branch-moves-nothing-on-screen.md
priority: high
type: bug
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while verifying the variant route before documenting it (TASK-081), not by reading the ADR.

The route ADR 0016 recommends to an agent holding a claim is: branch, restructure out of the human's way, swap it back in one write.

```
board save --board payments --variant wip        # branch
add --board payments@wip ...                     # the restructure
board save --board payments@wip --as payments    # the swap
```

The swap works: it passes ADR 0006's hash check without `--force` and the destination board reads the new content. But `src/server.ts:3805` repoints only the panes holding the **source**, and a swap's source is the variant. So the pane holding `payments` keeps rendering the pre-swap scene.

Measured with a socket standing in for a pane: 10 elements before, 10 after the swap, 12 after a following plain `board open` (no `--reload` needed).

**Why it matters more than it looks.** This is the recommended way for an agent to do substantial work without leaving a half-finished board in front of somebody. The agent announces it is done, and the human is still looking at the old board with nothing saying so. TASK-081 had to document a fourth command (`board open payments`) purely to work around it.

**It is a judgement call, not an obvious defect.** ADR 0012 deliberately stops a save from moving panes, and that reasoning is sound — but it protects the *source's* panes. Here a pane is holding a board whose note was rewritten underneath it, and nothing tells it. That is the same shape as the cross-canvas gap TASK-080 closed with `watchBoardLocks`, and TASK-079's held-board mark is the same family again: a pane holding a board that moved under it.

Whether the fix is repointing the destination's panes, telling them the note changed, or leaving it to TASK-062's indicator is the decision this task carries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a swap, a pane holding the destination shows what the swap wrote, or is told that it does not
- [ ] #2 ADR 0012 is honoured or amended, not quietly contradicted — a save still does not move the source's panes
- [ ] #3 The skill stops needing a fourth command to work around it
- [ ] #4 A check covers the swap from the destination pane's side, which is the side nothing tested
<!-- AC:END -->
