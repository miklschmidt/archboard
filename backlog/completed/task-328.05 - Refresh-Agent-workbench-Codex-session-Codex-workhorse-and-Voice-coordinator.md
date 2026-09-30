---
id: TASK-328.05
title: 'Refresh Agent workbench, Codex session, Codex workhorse and Voice coordinator'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:39'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 568000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Codex family after TASK-291 to TASK-321: workhorse news delivered at once by turn/start, tell_coordinator (codex-coordinator-callbacks), the coordinator as the voice model's subconscious, auto-review config (TASK-314), recordings holding the voice, gpt-6 models, and the coordinator's [FINAL]/[COMMENTARY] channel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Claim each board (Agent workbench, Codex session, Codex workhorse, Voice coordinator), show it, read every bound file and the code around it, list drift with evidence.
2. Write corrections with ./bin/dogfood semantic edit (expect-version, doing) editing the current variant in place, keeping ids; add what TASK-291..321 code the boards' questions need (workhorse news, tell_coordinator, outcome report port, coordinator as subconscious, config.toml auto-review, shared Codex home, recordings holding the voice).
3. Rasterize each board to $CLAUDE_JOB_DIR/tmp/328-05, inspect, report renderer defects.
4. Release claims, ./bin/dogfood check clean for my boards, commit my vault files and task file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drift found (evidence):
- Codex workhorse / Agent workbench: a pane's typed message does not pass through Workhorse operations. The gateway's text actions (src/server/archboard/lib/codex-workbench-text-actions.ts createServerCanonicalTextActions) call session.turnStart/turnSteer/turnInterrupt directly and its queue actions (codex-workbench-browser-gateway.ts) call the queue directly; Workhorse operations is the coordinator's door only (codex-coordinator-tools call-execution; operations.ts comment 'two coordinator effects never interleave').
- Board tools (codex-dynamic-tools) serve the archboard_app manifest: create/fork/list/read/send_message/wait on threads (codex-dynamic-tools/lib/vocabulary.ts, codex-thread-tools/archboard-app-manifest.json), not board reads or approvals.
- Workhorse queue drives Codex's own thread queue (queue.ts session.queueAdd/Update/Delete/Reorder/Start).
- Codex session: decodeResponse comes from codex-protocol; session.ts requestDecoded is the one path (serialize, transport.request, decode, adopt); reverse-requests validate epoch through the identity authority, not request-identities; container-sourced edges and the serialize->decode and decode->adopt chains are not calls.
- Voice coordinator: Turn callbacks now = workhorse news (workhorse-news.ts), tell_coordinator (tell-coordinator.ts), delivery (deliver.ts) through the outcome report port (server/archboard/lib/codex-workbench-outcome-report.ts, turn/start); pane news appended by the callbacks' own realtime port; semantic brief reaches neither model's start.
- Codex process: shared machine Codex home and config.toml auto-review defaults (codex-workbench-production.ts createWorkbenchStorage, codex-process/lib/storage.ts).
- Generation composition: createCodexProcess is called from codex-workbench.ts installProductionCodexWorkbench, not the factories file.
- Variant summaries ('as implemented on 2026-09-13') cannot be changed through semantic edit (no summary field in the edit payload); left as they are.

Written under claims through ./bin/dogfood semantic edit: Codex session v7->8, Codex workhorse v3->4, Voice coordinator v3->5, Agent workbench v10->12; each rasterized and inspected (PNGs in the job tmp dir); ./bin/dogfood check reports 0 diagnostics. Every board edited its current variant in place; no ids renamed; no proposals. Renderer note: on Agent workbench and Codex workhorse many relationships into Codex session merge on one shared trunk, so a label is hard to pair with its line; meaning is right, left as a renderer observation. README's Codex workhorse row ('The one door into a workhorse thread') is now inaccurate; README belongs to the parent task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Brought Agent workbench, Codex session, Codex workhorse and Voice coordinator in step with the code. Added workhorse news, tell_coordinator and the outcome report port (Voice coordinator, as children of Coordinator callbacks; Agent workbench as a module), board-change delivery and semantic context on Agent workbench, and the shared Codex home with auto-review config. Corrected pre-existing errors: a pane's message goes straight to the session, not through Workhorse operations; Board tools are archboard_app thread tools; the queue drives Codex's thread queue; Codex session's request path is session.ts's requestDecoded. Verified by reading each bound file, rasterizing each board and ./bin/dogfood check (0 diagnostics).
<!-- SECTION:FINAL_SUMMARY:END -->
