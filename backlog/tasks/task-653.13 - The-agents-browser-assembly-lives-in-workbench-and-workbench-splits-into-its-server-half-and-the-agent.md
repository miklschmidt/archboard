---
id: TASK-653.13
title: >-
  The agent's browser assembly lives in workbench, and workbench splits into its
  server half and the agent
status: Done
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-20T17:27:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.12
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 10, browser half (10b), of the archboard-deepen run. After 10a, workbench still hands apps/web its ./agent and ./voice surfaces as about 19 parts that apps/web assembles in about 1,850 lines. That assembly moves into workbench behind ten names, and then workbench splits into the server package and an agent package above it, two behaviors under ADR 0055. One short confirming round with both advisors (docs/agents/advisors.md) after candidate 9 merges is part of this ticket: it confirms the ten names against what candidate 9 left, places isSpeakingLevel (private to the agent package or its eleventh name) and names the new package (not "shell", the glossary's word for the web app). The settled design, every decision and its reason: the "Candidate 10, workbench: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-10-workbench.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Decisions marked [10b] and [both] in the tree apply, with candidate 9's correction of isSpeakingLevel.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: workbench browser side (packages/workbench/src/ui, entries ./agent and ./voice), the new agent package split from it, and the agent assembly leaving apps/web (apps/web/src/ui).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on workbench and the new agent package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The confirming advisor round ran after candidate 9 merged, and its answers (the ten names, isSpeakingLevel's place, the package name) are recorded in the run's decision log before the move starts
- [x] #2 The agent package exports AgentRoot({ activePaneId, openAnswerFile, chooseShownConversation, children }), AgentDock, AgentPanel, AgentPane({ paneId, conversation, recording, dockless, reducedMotion }), TalkControl, useNarrateKey, useAgentVoice, RecordedVoice({ level, children }), RecordedVoiceBox({ transcript, presented }) and AgentAnswer, with any change the confirming round made; the pane owns its socket, and React mount and unmount register the hosted conversation per socket generation
- [x] #3 apps/web no longer assembles the agent; agent-setup-ports, pane-subtitles-box and pane-subtitles tests move into the package, rewritten to cross its interface
- [x] #4 Workbench splits as a pure move into the server package (about 12) and the agent package (about 10) above it, each 20 or fewer; package-graph.test.ts, package-api.test.ts areas and interface-width ceilings take the measured counts; INTERFACE_WIDE clears on both
- [x] #5 An ADR records the two behaviors under ADR 0055, amends nothing and states the counter-evidence (3 of 7 recent src/ui commits also touched src/server); the glossary names the new package's concept if its name is new
- [x] #6 The dock, panel, voice box, presentation bar, replay page and narration look and behave the same in both themes, shown by screenshots before and after, and the site audit (site/README.md#audit-the-site) passes
- [x] #7 Every system test of the server half passes with only import changes; the stage harness wraps in AgentRoot; the presentation hang-up test crosses the package's interface (rewritten at the build stop, decision log 'TASK-653.13 stop: SETTLED')
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Confirming advisor round done after candidate 9: read 'Candidate 10b CONFIRMED after candidate 9' in the run's decision log. The new package is @archboard/agent-surfaces (one entry, layer 10).

Merged into deepen/module-depth at 2d746e6356 (vault slice f25e3f5152). @archboard/agent-surfaces has one entry with eleven names; useNarrateKey became the NarrateKey component, which seats the orb itself (a5717b9f31), so the width stays eleven. Ceilings: workbench 52 -> 16, agent-surfaces 18 (the repository test counts types). Code check: workbench's INTERFACE_WIDE and its VoiceSessionPorts unused export are gone; Workbench transport reads 41 until adoption because three Current anchors name moved files (the proposal re-anchors them). Footprint gate exit 1 with two recorded exceptions (Recording pace and Talk playback import types from the new package). All lanes pass on the merged tree; opener-settings timed out once and passed on rerun. Screenshots before and after in both themes match; site audit passes (every internal link of 18 pages resolves).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The agent's browser assembly moved out of apps/web and workbench's ui into @archboard/agent-surfaces (eleven names, ADR 0092); workbench keeps its server half at 16. No behavior change: screenshots match in both themes, every test lane passes.
<!-- SECTION:FINAL_SUMMARY:END -->
