---
id: TASK-297
title: >-
  Each model gets its own prompt and nothing else: no workhorse text on the
  coordinator, no JSON and no startup context for the voice model
status: Done
assignee:
  - '@claude'
created_date: '2026-09-22 16:56'
updated_date: '2026-09-23 00:56'
labels:
  - voice
  - bug
dependencies: []
ordinal: 517000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read from the 2026-09-22 02:38 voice session: the coordinator thread's developer instructions are the workhorse document with the coordinator document appended ('this coordinator role takes precedence over the shared workhorse role above'); the realtime start instructions repeat the whole composed text plus the semantic brief and the board catalogue as JSON, and Codex renders them into the coordinator's world state as <realtime_conversation> every turn; the voice session is started with includeStartupContext, so Codex prepends a <startup_context> of recent threads and a workspace scan to the voice prompt, and with two initial developer items holding the semantic brief and the board catalogue as JSON, and every catalogue change is appended to the voice session as JSON too. The user ruled: the workhorse gets the workhorse prompt only, the coordinator the coordinator prompt only, the voice model the voice prompt only, and no JSON blob reaches the voice model. Data the coordinator needs (catalogue, board context) reaches it as data on its own thread, never the voice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The coordinator thread's developer instructions are one standalone coordinator document that does not contain or refer to the workhorse document; the workhorse thread's are the workhorse document alone.
- [x] #2 The realtime start instructions carry only what the coordinator needs for a voice session (the channel rule and, when narrating, the presentation instructions): no copy of its developer instructions, no brief, no catalogue.
- [x] #3 The voice session starts without Codex's startup context and with no developer items; in presentation mode its only initial item is the user's narrate request, and no catalogue or context JSON is ever appended to it afterwards.
- [x] #4 The voice prompt no longer refers to a brief it is not given; every digest, fixture, golden body and design document that pinned the old composition is updated, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Coordinator document standalone (coordinator-developer-instructions.txt, digest 542fc4ab…), composition machinery removed from codex-instructions; review.ts pins the coordinator digest. 2. start-policy: includeStartupContext false, no developer items, only the narrate request when narrating, realtimeStartInstructions = channel rule (+ presentation instructions). 3. catalogue-updates: coordinator injection at start and on change, no voice append. 4. Voice prompt stops referring to a brief or catalogue. 5. Tests, fixtures, DESIGN.md and the authored-contracts design updated.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: codex-instructions, codex-coordinator, codex-realtime, codex-thread-tools, codex-workhorse-start owners plus production-initialization, browser-projection, realtime-transcript-projection, codex-pane-context, codex-workbench-production and the process-contract codex-realtime test (233 + 8 pass); browser owners codex-live-voice and semantic-walkthrough-narration pass; lint and both type-checks clean for every file of this change. The full gate could not be read cleanly because TASK-296 (the Excalidraw removal) is being worked in the same tree at the same time; AC4's bun run check is re-run once that lands.

AC #4: TASK-296 has landed and the full gate is green on the combined tree. bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included). The user confirmed on 2026-09-23 that voice works as intended.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workhorse, coordinator and voice model each get only their own prompt: a standalone coordinator document, realtime start instructions limited to the channel rule, a voice session with no startup context and no developer items, and no catalogue or context JSON appended to the voice. Digests, fixtures and design docs updated. Verified by the focused owners, the browser voice owners and the full gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included)., plus the user's real voice use.
<!-- SECTION:FINAL_SUMMARY:END -->
