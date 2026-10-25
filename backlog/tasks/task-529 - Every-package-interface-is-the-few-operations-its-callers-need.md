---
id: TASK-529
title: Every package interface is the few operations its callers need
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-500 moved code into packages but kept every name the old shallow callers imported. Its rule exported whatever outside code imported today, and its criteria counted subpaths, not names. Five packages now export more than 120 names, and callers assemble package internals themselves. ADR 0055 asks for a few operations per job. The codebase-design skill measures an interface by everything a caller must learn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each package exposes only operations that callers need, and callers no longer assemble its internals
- [ ] #2 A recorded rule and a repository check keep an interface from regrowing by caller demand alone
- [ ] #3 The renderer is out of scope because it is being rewritten
- [ ] #4 bun run check passes, except the waived renderer timing owners
<!-- AC:END -->
