---
id: TASK-199
title: Clean up and merge the readable renderer
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-13 11:17'
labels: []
dependencies: []
ordinal: 358000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user accepted the new renderer after side-by-side comparison. Integrate it into feat/semantic-boards while preserving the existing session changes and permanent architecture vault, and retire temporary comparison tooling and servers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New renderer and predecessor placement are committed and merged into feat/semantic-boards without losing earlier session work.
- [ ] #2 Temporary comparison pages, processes, and worktree-specific instructions are removed; permanent boards and useful proposal history remain.
- [ ] #3 The primary server serves the merged renderer, browser opens the normal app, and validation passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compare both uncommitted worktrees and preserve the base; remove temporary comparison instructions/artifacts; commit renderer atop the base and fast-forward merge; build and verify primary checkout, then retire extra servers and worktree.
<!-- SECTION:PLAN:END -->
