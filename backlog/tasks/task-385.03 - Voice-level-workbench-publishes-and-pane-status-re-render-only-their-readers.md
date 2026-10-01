---
id: TASK-385.03
title: 'Voice level, workbench publishes and pane status re-render only their readers'
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-01 03:24'
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
