---
id: TASK-385.03
title: 'Voice level, workbench publishes and pane status re-render only their readers'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 03:24'
updated_date: '2026-10-01 10:33'
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
- [x] #1 A voice level frame re-renders only the components that draw the level or the speaking state
- [x] #2 A workbench publish re-renders only the components that show what it changed, and the board panes do not re-render
- [x] #3 A pane status publish re-renders no SemanticBoardStage
- [x] #4 Tests fail when a voice level frame draws the Talk control between threshold crossings, or when a streamed reply changes the agent setup snapshot that the root reads. Pane news has no module seam and is measured with the probe
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pane news: pane elements depend only on the list, callbacks and handles, never the records. onVariantChange reads the records and actions through a LiveBinding. PaneDiagram is memoized, so the session news of a pane stops at the pane.
2. Voice level: AgentVoiceView carries a VoiceLevel source, not a number. useVoiceView never reads it. TalkControl subscribes to whether it is over the speaking level, and the wave reads it in its frame loop.
3. Workbench publishes: the root holds only the actions, the draft, the panel state and the voice (useAgentSurfaces, useAgent). AgentBarSlot and AgentPanelSlot each read the conversation, approvals and progress through useAgentView where they are drawn. stop reads the running turn from the transport when pressed, so the actions do not change per publish.
4. Agent setup: publish only when the snapshot says something new. It listens to the transport and published a new snapshot for every piece of a reply, which the root reads.
5. Owners: talk-control.test.tsx (level frames), agent-setup.test.ts (a reply changes no snapshot). Pane news has no module seam (private hooks), so the probe measurement is the evidence.
6. Board proposals: none. Browser application describes the agent wiring at a level this does not change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 1 (pane news and voice level):
- Pane news: usePaneViews no longer lists the whole panes object, which changes with every record, as a dependency. The root's onVariantChange reads the records and the actions through a LiveBinding, so it keeps one identity. PaneDiagram is memoized, so a pane's own session news (holder, doing, contact) stops at the pane. Measured with the probe: a claim and a release went from 2988 component renders to 1356. The stage now renders twice, for the claim banner's resize and refit, which is legitimate, instead of about ten times.
- Seam: the module lint forbids tests from importing private hooks (usePanes, usePaneViews). A browser owner cannot isolate this either: the lane builds minified (no component names), and a claim legitimately resizes the stage. So the probe measurement is the evidence, with no regression test.
- Voice level: AgentVoiceView.level is now a VoiceLevel source (read, subscribe), and the audible flag is gone. useVoiceView never reads the level, so the root no longer renders on every frame while the model speaks. TalkControl subscribes to a yes or no (over the speaking level), and the wave reads the level in its own frame loop. src/ui/workbench/tests/talk-control.test.tsx owns it: 30 frames under the level draw nothing, and crossing it draws once. A mutation that subscribes to the raw level turns it red.

Checkpoint 2 (workbench publishes): measured with the probe against a server running the fake production Codex (tests/system/server-state/fixtures), signed in, sending one message.
- Before the agent setup fix: ApplicationBody still started 16 commits during the reply, because the setup published a new snapshot object for every transport publish.
- After: the reply's publishes start commits only in the leaves (AgentBarSlot 8, AgentPanelSlot 8, PaneSubtitles 8). ApplicationBody starts 5, for the send itself: the panel opens, and the held message is sending, delivered and dropped.
- One SemanticBoardStage render comes from the panel opening beside the pane (a resize).
- The baseline bundle run: ApplicationBody started 12 commits for fewer events.

Not done here, proposed as follow-up: pane news (claims, activity, status) still renders the shell, and the navigator rebuilds every row object from the shell view. It happens per event, not per frame or per delta.

I revised the fourth criterion after I found the seams. The first version asked for tests on every path. The module lint keeps usePanes and usePaneViews private to tests. A browser owner runs a minified build without component names, and a claim legitimately resizes the stage through its banner. So pane news is owned by the probe measurement, and the criterion now says so.

Validation: bun run check passes. That covers lint, formatting, both type checks, 3742 module tests, 189 system tests, the repository checks and the 19 browser owners, among them codex-text-workbench and codex-live-voice.

Since TASK-385.05, pane news has a test at the application entrypoint (src/ui/application/tests/pane-news.test.tsx), so it is no longer measured only with the probe.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The application root no longer renders for high-frequency news. The voice level is a source that only the Talk control (a yes or no over the speaking level) and the wave (its frame loop) read. The conversation, approvals and progress are read by AgentBarSlot and AgentPanelSlot where they are drawn, and stop reads the running turn when pressed. The agent setup publishes only a changed snapshot, because before it re-published on every transport publish. Pane elements no longer depend on the records, and PaneDiagram is memoized. Measured: a claim and release went from 2988 component renders to 1356. During a fake-Codex reply, only the agent slots and the subtitles render. Owned by talk-control.test.tsx and agent-setup.test.ts, and verified by bun run check.
<!-- SECTION:FINAL_SUMMARY:END -->
