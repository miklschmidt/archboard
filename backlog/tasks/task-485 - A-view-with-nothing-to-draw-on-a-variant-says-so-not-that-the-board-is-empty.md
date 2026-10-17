---
id: TASK-485
title: 'A view with nothing to draw on a variant says so, not that the board is empty'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-16 12:59'
updated_date: '2026-10-17 04:20'
labels:
  - renderer
  - cli
dependencies: []
priority: low
type: bug
ordinal: 850000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Shared views often name flows or parts that only some variants hold. Rasterizing such a view on a variant that holds none of them fails with 'Semantic board "Endpoint Gateway" has nothing on it yet, so there is nothing to draw', which is false: the board has content, only this view of this variant draws nothing. Agents fixing the Docs-Architecture-Design boards on 2026-10-16 read the message as a broken board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rendering or rasterizing a view that draws nothing on the chosen variant names the view and the variant and says the view has nothing on that variant
- [x] #2 A board with no content at all keeps its own message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A render that draws nothing now answers empty: VIEW_EMPTY_ON_VARIANT when a view was chosen and the variant holds nodes or flows; NOTHING_TO_RENDER otherwise (board.ts emptyReason; renderer errors unchanged). The message 'has nothing on it yet' came from the CLI handlers of semantic render and semantic rasterize (both now call cli/commands/lib/nothing-drawn.ts refuseNothingDrawn); the server route passes the reply through and the browser pane already words a view as 'is empty on <variant>'. The new refusal is declared on both commands with exit 2, the exit the old message had. Tests: runtime/semantic-renderer/tests/empty-view.test.ts, cli/commands/tests/nothing-drawn.test.ts. wide-boards.test.ts (3 timing bounds on heavy vault boards) fails independent of this change.

Live check 2026-10-17 on the restarted server: rasterizing Endpoint Gateway's view 'Ordinary request authorization' on 'Device mTLS design' (Docs-Architecture-Design) answers exit 2 with 'The view "Ordinary request authorization" draws nothing on "Device mTLS design": none of the parts or flows it names are on that variant.' Tests: src/runtime/semantic-renderer/tests/empty-view.test.ts and src/cli/commands/tests/nothing-drawn.test.ts pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A view that draws nothing on the chosen variant is refused with VIEW_EMPTY_ON_VARIANT, naming the view and the variant; a variant with no content keeps NOTHING_TO_RENDER and its empty-board message. Verified by the renderer and CLI tests and a live rasterize on Docs-Architecture-Design.
<!-- SECTION:FINAL_SUMMARY:END -->
