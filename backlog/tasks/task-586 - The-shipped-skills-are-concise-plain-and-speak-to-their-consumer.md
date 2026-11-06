---
id: TASK-586
title: The shipped skills are concise, plain and speak to their consumer
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-06T19:12:00Z'
updated_date: '2026-11-06T19:18:00Z'
labels: []
dependencies: []
ordinal: 1033000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents and readers need concise instructions without duplicate rules or internal implementation detail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All shipped skill prose preserves consumer behavior in plain English
- [ ] #2 Required validation runs and results are recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read all shipped guidance. Rewrite and consolidate consumer rules. Regenerate references and run required gates. Record evidence and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No architecture proposal is needed: these edits change documentation placement and wording, not model behavior. Repository tests pass 163 cases and formatting passes. Full validation is still running. The complete reference rewrite and sentence audit remain unfinished.

The full gate failed: check:model exited 1 with model findings, and lint:core exited 137. The initial system and solo runs overlapped setup and failed on missing core/frontend artifacts. Both lanes now run again after the build. No skill evaluations ran. This is a partial checkpoint, not completion.
<!-- SECTION:NOTES:END -->
