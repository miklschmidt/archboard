---
id: TASK-529.07
title: The walkthrough and skills interfaces are a few operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:27:00Z'
updated_date: '2026-10-25T02:01:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 948000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the walkthrough and skills package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [x] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Walkthrough went from 38 to 21 exported names and skills from 16 to 3, measured with the interface count script. Every old skills name had a caller in scripts/evaluate-skill.ts, which the count script does not scan. That script assembled them, so its command line moved into the package as runEvaluationCommand behind one evaluation entry. anchorsOf stays public because its caller, the skill-links test, must stay in the repository lane, whose cache follows every tracked file. Walkthrough gained freshTalkPlace, keepTalk, recordingContainerOf, publishRecordingPage and publishReplayPage, which replace the place, format, container and page-global pieces that callers assembled. Callers derive the page, state, log, event, container and narration types. Type-check, lint, focused tests, the walkthrough system tests and repository-policy all exit 0.
<!-- SECTION:NOTES:END -->
