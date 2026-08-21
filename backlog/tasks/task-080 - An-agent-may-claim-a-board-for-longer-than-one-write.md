---
id: TASK-080
title: An agent may claim a board for longer than one write
status: To Do
assignee: []
created_date: '2026-08-20 20:17'
updated_date: '2026-08-21 14:50'
labels: []
dependencies:
  - TASK-067
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/design/server-is-the-truth.md
type: feature
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 9 of docs/design/the-plan.md. From the section ADR 0016 gained after TASK-067 was filed. TASK-067 builds the per-write mutex; this is the long claim on top of it, and it is deliberately separate because it is a different amount of work and a different set of risks.

WHY A PER-WRITE LOCK IS NOT ENOUGH. It fits most of what an agent does. It does not fit an agent that knows it is about to redraw a board, restructure a subsystem, or work through twenty elements. Taking and releasing a lock twenty times leaves nineteen gaps for somebody else to write into, and produces a board that was never in one consistent state while it was being built.

SO AN AGENT CAN CLAIM A BOARD and say how long it expects to need it. Three constraints came with the decision and all three are settled, not open:

1. A LONG CLAIM IS NOT A LONG UNATTENDED HOLD. The claim has a time to live, perhaps an hour, and the holder renews while it is working. Stop renewing and it expires in seconds. The time to live bounds how long a working agent may keep the board; the renewal interval bounds how long a dead agent keeps it. A flat hour with no renewal means one crash costs an hour, which is the whole board gone for everybody else. Both constants belong in the module TASK-066 creates.

2. A HUMAN CAN ALWAYS TAKE IT BACK. The lock excludes writers from each other. It does not lock a person out of their own wall, and an agent that has claimed a board for an hour must not be able to grey out a 75-inch display somebody is standing in front of. A human's touch revokes the claim, the agent is told, and it stops rather than fighting for it. An agent that has lost its claim finishes nothing further and says so.

3. THE PANE SAYS WHO HOLDS IT AND WHY. For a two-hundred millisecond write, disabled is enough. For a claim that may run for minutes, a person needs to know an agent is restructuring the board and roughly what it is doing, or the wall has simply stopped working for no reason they can see. So a claim carries a reason, and the reason is what the pane shows.

FAIL CLOSED. Change reports are deliberately not gated on the socket, so a pane whose socket has dropped never hears about a claim and would keep letting a human draw. Whatever TASK-067 decides for the per-write lock applies here and matters more, because the window is minutes rather than milliseconds.

SURFACES. Claiming and releasing are agent actions, so they need a CLI command and an MCP tool, held at parity by `scripts/check-surface-parity.mjs`. Teaching an agent when to use them is a separate task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent can claim a board with a stated reason and an expected duration, and release it
- [ ] #2 A claim has a time to live and is renewed while the holder works; a holder that stops renewing loses it in seconds, not at the time to live
- [ ] #3 A human touch on a claimed board revokes the claim, the agent is told it has lost the board, and it stops
- [ ] #4 A pane whose board is claimed shows who holds it and the reason they gave, not just a disabled surface
- [ ] #5 A pane that cannot hear about a claim does not let a human draw on a claimed board
- [ ] #6 Claiming and releasing exist on both the CLI and MCP, proven by check-surface-parity
- [ ] #7 A check shows a claim surviving twenty writes with no gap another writer could take
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-21 14:50
---
TASK-067 landed the per-write mutex (src/core/board-lock.ts). Three things it left shaped for this one.

THE CLAIM IS holdBoard WITH A LONGER LEASE AND A REASON. The lock is already reentrant by holder id, so renewing is calling holdBoard again with the same id; `leaseMs` and `reason` are already arguments and the reason already travels to the panes on the board_lock message and into the refusal sentence ("held by an agent (redrawing payments)"). What is missing is a CLI command, an MCP tool, and a holder id an agent keeps across requests instead of the per-request one src/server.ts:holderFromRequest mints.

A HUMAN TAKING IT BACK IS releaseHold PLUS ONE RULE. Today a person's hold is refused while an agent holds the board, and the pane goes read-only. Revocation is the opposite: a touch takes the board from the agent. The place for it is the /api/boards/hold route, which already knows the holder is a person; it needs to steal rather than be refused when the current holder is an agent with a claim, and the agent needs to be told, which is what board_lock's holder field already carries.

THE PANE SHOWS WHO AND WHY. useCanvasSession returns `heldBy` next to `readOnly` and nothing renders it yet. That was left deliberately: for a 20 ms write there is nothing worth saying.

AND ONE REAL GAP THIS TASK INHERITS. A second canvas over the same vault is excluded correctly, because exclusion reads the lock file, but its panes learn a board is held when a write is refused rather than before the touch — nothing polls the lock directory. ADR 0016 now records that. For a per-write hold it costs milliseconds; for a claim running minutes it is a pane that is wrong for minutes, so the poll belongs here.
---
<!-- COMMENTS:END -->
