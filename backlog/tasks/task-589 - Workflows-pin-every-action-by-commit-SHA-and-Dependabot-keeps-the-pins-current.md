---
id: TASK-589
title: >-
  Workflows pin every action by commit SHA, and Dependabot keeps the pins
  current
status: In Progress
assignee: []
created_date: '2026-11-07T12:08:00Z'
updated_date: '2026-11-07T12:09:00Z'
labels: []
dependencies: []
ordinal: 1036000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tag can move, so an action named by tag runs whatever the tag points at. Pin every external action to its commit SHA with the version in a comment, make CI fail on an unpinned action, and let Dependabot propose new versions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every external action in .github/workflows is pinned to a full commit SHA with its version in a comment
- [ ] #2 CI fails when a workflow names an action without its commit SHA
- [ ] #3 Dependabot proposes grouped updates of the pinned actions
<!-- AC:END -->
