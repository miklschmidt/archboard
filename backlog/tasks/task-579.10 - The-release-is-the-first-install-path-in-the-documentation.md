---
id: TASK-579.10
title: The release is the first install path in the documentation
status: To Do
assignee: []
created_date: '2026-11-05T14:59:00Z'
labels: []
dependencies:
  - TASK-579.09
references:
  - INSTALL.md
  - README.md
  - site/src/components/QuickStart.astro
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: docs
ordinal: 1031000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
INSTALL.md, the README and the site tell every reader to clone and build. After the first publication, a clone is the contributor path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 INSTALL.md, the README and the site quick start show the npm install first and the clone as the contributor path
- [ ] #2 `bun run readme:check` and the format checks pass
<!-- AC:END -->
