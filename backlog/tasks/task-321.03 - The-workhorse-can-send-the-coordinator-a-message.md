---
id: TASK-321.03
title: The workhorse can send the coordinator a message
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 23:38'
updated_date: '2026-09-24 09:19'
labels:
  - voice
  - coordinator
  - codex
dependencies: []
parent_task_id: TASK-321
priority: high
type: feature
ordinal: 559000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third slice of TASK-321: the workhorse needs a dynamic tool to tell the coordinator something while it works (a question, a milestone, a blocker), and its prompt says when to use it. The message reaches the coordinator the way workhorse outcomes do, only while voice is live; otherwise the tool says nobody is listening.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The workhorse has a dynamic tool that sends the coordinator one message, and its instructions say when to use it
- [x] #2 While voice is live the message reaches the coordinator at once; with no voice session the tool answers that nobody is listening and nothing is sent
- [x] #3 One owner proves both
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A pinned manifest archboard-coordinator.json (namespace archboard_coordinator, one tool tell_coordinator {message}) in codex-coordinator-callbacks; the workhorse is started with it beside archboard_app, and the workhorse manifest hash covers both.
2. The callback kind workhorse_turn becomes workhorse_news (the glossary word) with a fifth type, message, whose detail is what the workhorse said; its sentence is 'The workhorse says: ...'.
3. The callbacks module answers the tool call (new transport owner codex-coordinator-callbacks, routed by the workbench router): a call from the linked workhorse while voice is live is enqueued and delivered at once through the existing coordinator turn port; with no voice session nothing is sent and the tool says nobody is listening.
4. Workhorse instructions say when to use it; digest re-pinned.
5. One callbacks-module test proves both outcomes; DESIGN.md and the authored-contracts doc describe the tool.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The workhorse starts with archboard_coordinator beside archboard_app; its recorded manifest hash covers both digests. The callback kind workhorse_turn is now workhorse_news with a fifth type, message; the coordinator turn port takes a situation (ended, waiting, message) instead of a waiting flag, and a message gets its own prompt line (relay a question in [FINAL], steer the workhorse with the answer). Calls route through a new transport owner, codex-coordinator-callbacks, to the callbacks module, which answers in plain prose. Existing workhorse threads keep the tools they started with; a new workhorse thread gets the tool. Gate: type-check, lint, fmt:check, build:frontend, test:modules, test:system, test:repository and test:serial-browser all exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The workhorse can tell the coordinator something while it works: tell_coordinator (namespace archboard_coordinator, pinned manifest in codex-coordinator-callbacks) queues its message as workhorse news, delivered to the coordinator at once while voice is live; with no voice session or during a recording nothing is sent and the workhorse is told nobody is listening. Its instructions say when to use it and to leave finished work to its final answer. Proven by one test in codex-coordinator-callbacks/tests/workhorse-news.test.ts; every gate lane passes.
<!-- SECTION:FINAL_SUMMARY:END -->
