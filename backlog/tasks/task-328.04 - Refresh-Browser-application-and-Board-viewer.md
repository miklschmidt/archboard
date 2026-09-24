---
id: TASK-328.04
title: Refresh Browser application and Board viewer
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:36'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 567000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser application (src/ui, frontend) after the routing and query migration, the voice UI (subtitles, narration), the walkthrough recording page, and the renamed callback and port types (PaneCallbacks, Workbench, VoiceStore).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read CLAUDE.md, .archboard/README.md, the archboard skill and its edit/authoring references, docs/agents/frontend.md.
2. Claim Browser application; show it; read every bound file and the code around it; list drifts with evidence.
3. Write corrections with semantic edit (ids kept, current variant only); update flows, views, walkthrough beats.
4. Same for Board viewer.
5. Rasterize both, inspect PNGs, report renderer defects.
6. Release claims, run ./bin/dogfood check, commit the two board files and this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser application v10->v11 (one write under claim). Drift found: Semantic viewer never used Server requests (api/semantic-boards.ts plain fetch) -> pqG9kqlF now Semantic viewer->Archboard server http; Board catalog reads the viewer's semanticBoardListQuery and pane-session fetchPaneInventory (4iVsoxG0 restated, new edge to Pane session); Shell renders neither the stage nor the agent bar - application composes them (ApplicationPane->SemanticBoardStage, useAgentSlots) so VbLQ6rfX/WchncnH1 now start at Application composition; code opening runs pane-core.ts openCode->activateCodeTarget (Cw08FQeQ now from Pane session); routing restores through the WorkspacePort the application implements (zfz9dQDf now Routing->Application); Voice session never called the workbench (YZqZjfIj removed) and the workbench UI does not ride the socket (Z6caFkg7 removed); Code target description said 'host shell'; Shell still described the workbench dock. Added: Agent setup, Workbench transport, Voice subtitles, Walkthrough recording, pane socket board news -> viewer (socket-messages.ts announceSemanticBoardChange), view 'Recording a walkthrough', two beats.
Board viewer v8->v9 (one write under claim). Drift: pictures come from the query cache through picture-source/local-pictures, not Fetch semantic reads; Picture source only chooses the source; the change-announcement invalidates query keys; narrative.ts computes focus but use-auto-fit fits (TASK-327); drill trail lives in use-drill-down.ts. Added Semantic queries, Local pictures, Keep fitted, Walkthrough position, Report the reading, Archboard server; removed QA6Vg8BG; beat 'Say what is on screen'. Every subject id kept.
Both rasterized and inspected; ./bin/dogfood check: 0 diagnostics. Variant summaries still say 'as implemented on 2026-09-13': the edit payload cannot change a variant summary.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Browser application and Board viewer current variants re-read against src/ui and frontend and corrected in one write each under a claim, ids kept, no historical variants on these boards. Evidence per relationship in the notes; ./bin/dogfood check reports no diagnostics; both boards rasterized and inspected.
<!-- SECTION:FINAL_SUMMARY:END -->
