---
id: TASK-579.09
title: A tag publishes the release to npm with provenance
status: To Do
assignee: []
created_date: '2026-11-05T14:59:00Z'
labels: []
dependencies:
  - TASK-579.08
references:
  - .github/workflows/ci.yml
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1030000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publishing by hand from a laptop gives no provenance and no proof that the tarball installs without the build tools.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `v<version>` tag that matches `package.json` builds the packages, installs the packed tarballs on Linux and macOS without Rust, Bun or Node.js and runs a smoke test
- [ ] #2 Only after the smoke test, every package is published with npm trusted publishing and provenance; a prerelease goes to the dist-tag `next`
- [ ] #3 The `@archboard` npm organization trusts the workflow, and no npm token is stored in the repository
<!-- AC:END -->
