---
id: TASK-542
title: The first track layout of Board viewer keeps within its 3 s local bound
status: To Do
assignee: []
created_date: '2026-10-25T17:35:00Z'
updated_date: '2026-10-25T18:23:00Z'
labels:
  - renderer
  - tooling
dependencies: []
ordinal: 949000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The gate fails `packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts` on "Board viewer (track)": the first layout takes 4.1 s alone and 3.07 s in the full lane, against the local bound of 3 s (TASK-377). The renderer and the current variant of Board viewer did not change in the session that found it (2026-10-25, from 96e6d3ebb), so an earlier commit or the machine causes it. The board last changed on 2026-10-22 (c4fe4c737). The renderer changed after that (fbb995bd8, a38cc867c).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the slower layout is named, with the commit or the condition that brings it
- [ ] #2 "Board viewer (track)" passes its 3 s first-layout bound locally, with the bound unchanged
- [ ] #3 No other case of wide-boards.test.ts gets slower
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: the owner said not to spend time on board rendering performance gates, because the renderer is being rewritten. The diagnosis agent was stopped with no result. The wide-boards track layout bound stays failing, and it is not repaired in this work.
<!-- SECTION:NOTES:END -->
