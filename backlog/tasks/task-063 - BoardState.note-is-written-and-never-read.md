---
id: TASK-063
title: BoardState.note is written and never read
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 20:20'
labels: []
dependencies:
  - TASK-078
references:
  - src/server.ts
  - src/core/board-store.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server. SUPERSEDED BY ADR 0015. See the comment. Do not pick this up on its own; it is a line item on the task that dismantles the in-memory board store.

src/server.ts writes BoardState.note at around 2512 and 2707 and nothing reads it. The save re-reads the destination itself at around 2636, which is what makes the field redundant rather than merely unused.

It holds the full text of the note, so an open board carries a 19 to 55 KB copy of a string nobody consults. Three boards open is roughly 150 KB of nothing, which does not matter on its own and does matter as a signal: it looks like a cache that a reader is relying on, so the next person to touch the save path has to work out that it is not.

WHAT ADR 0015 CHANGES. The field is one instance of the thing the ADR forbids: a second copy of a board held in a process, able to drift from the note. It disappears with `BoardState` itself when the board store stops holding board content.

The task originally offered two fixes. Only one is still available:

- DELETE IT. Still correct, and now part of a larger deletion.
- MAKE THE SAVE USE IT AND DROP THE RE-READ. Now wrong. Under ADR 0015 the note is re-read on every write, so the ADR 0006 hash check asks "did this change in the last two milliseconds" rather than "did this change since the session began". Caching the note bytes in the process would be exactly the drift the ADR exists to stop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 BoardState.note is gone, deleted along with the rest of the in-memory board content
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:10
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: superseded. The field goes away with the thing that holds it, and one
of the two fixes this task offers is now closed.

Verified still true: `src/server.ts:2512` and `src/server.ts:2707` write
`board.note`, and a repo-wide grep for readers finds none. The only other
`.note` hits in `src/` are an unrelated `--note` flag on `inject` and
`binding?.note` on the promote path.

Why it is superseded rather than merely still true. ADR 0015 forbids "a board
map that a reader can consult instead of the note" and "a second copy that can
drift from the first". `BoardState.note` is literally a second copy of the
note, 19 to 55 KB of it per open board, and `BoardState` as a whole is the
board map. Stage 7 of docs/design/the-plan.md dismantles it. Deleting one field
from a structure that is being taken apart is not worth its own change, its own
review or its own commit.

The task offered two fixes and ADR 0015 closes the second one. "Make the save
use it and drop the re-read" is now wrong: the note must be re-read on every
write, because the hash check has to ask "did this change in the last two
milliseconds", not "did this change since the session began" (ADR 0006, and
docs/design/server-is-the-truth.md section 9). Caching the note bytes is
precisely the drift ADR 0015 exists to stop. So only "delete it" remains.

Kept open rather than closed, because deleting it is a real line item on the
stage 7 task and somebody should be able to find the reasoning. Marked as
depending on that task, so it does not get picked up on its own.

Description edited to say so.
---
<!-- COMMENTS:END -->
