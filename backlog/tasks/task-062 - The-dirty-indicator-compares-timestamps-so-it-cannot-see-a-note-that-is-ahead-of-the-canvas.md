---
id: TASK-062
title: >-
  The dirty indicator compares timestamps, so it cannot see a note that is ahead
  of the canvas
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 19:12'
labels: []
dependencies: []
references:
  - frontend/src/shell/Shell.tsx
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

frontend/src/shell/Shell.tsx around 202 decides whether a board is dirty by comparing a change time against a save time. A timestamp comparison can only answer "changed since the last save". It cannot answer "the note on disk is ahead of what this pane is holding", and it shows clean in exactly that case.

That happens whenever something else writes the note: Obsidian, a sync client, another archboard process, or a second pane on the same board saving from its own baseline. The pane keeps showing an older board and says nothing is wrong, and the next save from it writes the older content back. ADR 0006 catches that at the moment of writing, with a refusal, but the human gets no warning until then and no clue while they keep drawing on a stale copy.

What the indicator should be able to say is which of the two is ahead, not merely that they differ. archboard already records the sha-256 of a note's bytes when it reads it (ADR 0006), so the material for a real answer is on hand.

TASK-047 fixed a related bug in the same function, where a branch left boardInfo pointing at a board the pane was not showing. This is the other half: even pointed at the right board, the comparison cannot express this state.

Note that a decision on the stateless server question may remove the concept of an unsaved board altogether, in which case this indicator changes meaning rather than being fixed. Worth sequencing after that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The indicator distinguishes a canvas ahead of its note from a note ahead of its canvas
- [ ] #2 A note changed on disk while a pane holds an older copy is visible without running a command
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 19:12
---
Correction from the coordinator. When filing this I wrote that it explained an incident earlier in the session, where the canvas held 45 and 34 elements while the notes held 55 and 50. That link is wrong and I have removed it.

In that incident the canvas was ahead of the notes, not behind them: a Codex session had cut edges and those deletions were unsaved, which is why memory had fewer elements than disk. Fewer elements meant newer, not older. A timestamp comparison handles that direction correctly, and the shell did show "unsaved changes" at the time.

The limitation this task describes is real and worth fixing. It just was not the cause of that incident, and saying so would have sent whoever picks this up looking for a reproduction that does not exist.
---
<!-- COMMENTS:END -->
