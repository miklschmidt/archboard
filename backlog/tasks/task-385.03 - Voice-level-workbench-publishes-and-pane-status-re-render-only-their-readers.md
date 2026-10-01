---
id: TASK-385.03
title: 'Voice level, workbench publishes and pane status re-render only their readers'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-01 03:24'
updated_date: '2026-10-01 04:28'
labels:
  - frontend
  - performance
dependencies: []
parent_task_id: TASK-385
priority: high
type: bug
ordinal: 667000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ApplicationBody (src/ui/application/index.tsx) subscribes to stores that publish often and passes the values down as props. The voice output level publishes on every animation frame while the model speaks (use-voice-view.ts reads it with useSyncExternalStore). Every workbench transport publish re-renders the root (useConversation in use-agent.ts). Each re-render rebuilds the Shell, the navigator rows, the pane bar and the agent bar. Each pane status publish gives the panes record a new identity, and usePaneViews lists it as a dependency, so every pane element is rebuilt and every SemanticBoardStage re-renders, although the comment in use-pane-views.ts says a status never rebuilds another pane. Found by a read-only audit on 2026-10-01 and checked at the cited lines. Not yet measured.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A voice level frame re-renders only the components that draw the level or the speaking state
- [ ] #2 A workbench publish re-renders only the components that show what it changed, and the board panes do not re-render
- [ ] #3 A pane status publish re-renders no SemanticBoardStage
- [ ] #4 Tests fail when one of these publishes re-renders the shell navigator or a board stage
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 1 (pane news and voice level):
- Pane news: usePaneViews no longer lists the whole panes object, which changes with every record, as a dependency. The root's onVariantChange reads the records and the actions through a LiveBinding, so it keeps one identity. PaneDiagram is memoized, so a pane's own session news (holder, doing, contact) stops at the pane. Measured with the probe: a claim and a release went from 2988 component renders to 1356. The stage now renders twice, for the claim banner's resize and refit, which is legitimate, instead of about ten times.
- Seam: the module lint forbids tests from importing private hooks (usePanes, usePaneViews). A browser owner cannot isolate this either: the lane builds minified (no component names), and a claim legitimately resizes the stage. So the probe measurement is the evidence, with no regression test.
- Voice level: AgentVoiceView.level is now a VoiceLevel source (read, subscribe), and the audible flag is gone. useVoiceView never reads the level, so the root no longer renders on every frame while the model speaks. TalkControl subscribes to a yes or no (over the speaking level), and the wave reads the level in its own frame loop. src/ui/workbench/tests/talk-control.test.tsx owns it: 30 frames under the level draw nothing, and crossing it draws once. A mutation that subscribes to the raw level turns it red.
<!-- SECTION:NOTES:END -->
