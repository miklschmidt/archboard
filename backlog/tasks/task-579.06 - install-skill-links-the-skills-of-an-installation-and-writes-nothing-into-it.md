---
id: TASK-579.06
title: install-skill links the skills of an installation and writes nothing into it
status: To Do
assignee: []
created_date: '2026-11-05T14:58:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - apps/cli/src/cli/operations/install-skill/install-skill.ts
  - packages/skills/src/runtime/operations/distribution/prepare.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1027000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today `install-skill` generates skill references inside the checkout `skills/` and then links them. A global install can be read-only, and a release has no `docs/` for the INSTALL.md links to point at.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In release mode `install-skill` links or copies the prebuilt skills and writes only into the skills root and the target repository
- [ ] #2 The shipped skill references carry the release commit and link to GitHub at the version tag
- [ ] #3 The Codex coordinator skill link uses the installation skills directory
<!-- AC:END -->
