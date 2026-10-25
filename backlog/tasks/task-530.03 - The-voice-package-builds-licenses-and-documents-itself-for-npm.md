---
id: TASK-530.03
title: The voice package builds, licenses and documents itself for npm
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 941000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The package exports raw TypeScript, declares no dependencies, depends on BUSL workspace code, refuses a Codex executable outside the Archboard checkout, and has no README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pack command builds ESM and type declarations with a publishable manifest, MIT LICENSE and README
- [ ] #2 The bundled workspace code is MIT and carries no Archboard checkout coupling
- [ ] #3 A test installs the packed tarball into a project outside the repository and type-checks and starts it
- [ ] #4 The README explains concepts, quickstart, configuration, security and troubleshooting
<!-- AC:END -->
