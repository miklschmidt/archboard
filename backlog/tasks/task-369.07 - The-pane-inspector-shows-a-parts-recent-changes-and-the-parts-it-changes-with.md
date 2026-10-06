---
id: TASK-369.07
title: The pane inspector shows a part's recent changes and the parts it changes with
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 12:56'
labels:
  - history
  - ui
dependencies:
  - TASK-369.03
  - TASK-369.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: low
type: feature
ordinal: 655000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The history lens reaches an agent through the CLI. A user reading a board sees it only if the inspector shows it. The picture has no free visual channel (ADR 0025), and traffic must not show churn (ADR 0027), so the sidebar is the place.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a part shows its recent commits and the parts it changes together with, each with a count
- [ ] #2 Selecting a coupled part from that list selects it on the canvas
- [ ] #3 Nothing is stored, and the canvas picture does not change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected board: Board viewer. It names each read the pane makes (Semantic queries -> Render stage states and -> Board reads list the render answer, the code findings; Board reads and Fetch semantic reads say what they read). The inspector's new read of the locality route changes those labels and responsibilities. Proposal Board viewer@TASK-369.07 restates them, with anchored relationships. No other board draws the inspector.
2. Client read: fetchLocality(board, variant) in api/semantic-boards.ts parses LocalityReplySchema; BoardReads gains locality (talkReads refuses it: a recording reads no history); localityQuery in lib/queries.ts keyed on board, variant id and version on screen, no refetchInterval, no focus or reconnect refetch, staleTime 0 so each selection (the selection panel is keyed by the pick and remounts) asks the server once, which answers from its memory unless a HEAD moved (ADR 0045).
3. lib/part-locality.ts: a pure reading of one part out of the board-wide answer: skipped with reason, read with its commits (newest first), the period of its repository and its coupled pairs (other part, shared commits, degree, unjoined); plus the board-wide count of large commits left out.
4. components/PartHistory.tsx: a sidebar region after What is it wired to?, only for a part. Recent commits with count (newest few, the rest behind a disclosure), Changes with: one choice row per coupled part with its shared count, its degree and whether nothing on the board joins them; choosing a row picks the part, pointing lights it. Words for: reading, failed (with retry), skipped (each reason), no commits in the period, no coupled part, large commits left out. On a historical or shelved variant it says the lens reads only the current variant and drafts and asks nothing; on a draft it asks for that draft.
5. Owners: rendered stage-harness test semantic-board-history.test.tsx (the region, the click-through, the skipped and no-commit words) and a focused test that the query runs on selection only: none before a pick, one per pick, none across vault-check polls, focus or time.
6. docs/design/operator-canvas-shell.md: the new region. Look at it at 1920x1080 light and dark on an own server with a copy of the dogfood vault, readme:check, gate lanes one at a time.
<!-- SECTION:PLAN:END -->
