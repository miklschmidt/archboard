---
id: TASK-579.09
title: A merged release PR publishes every package to npm through trusted publishing
status: To Do
assignee: []
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T15:15:00Z'
labels: []
dependencies:
  - TASK-579.08
  - TASK-579.11
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
Publishing by hand from a laptop gives no provenance and no proof that the tarball installs without the build tools. npm trusted publishing lets the release workflow publish through GitHub OIDC with no stored token, and gives each package provenance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the workflow run where release-please creates a release, the packages are built, the packed tarballs install on Linux and macOS without Rust, Bun or Node.js, and a smoke test passes
- [ ] #2 Only after the smoke test, every package is published through npm trusted publishing (GitHub OIDC, `id-token: write`) with provenance; a prerelease goes to the dist-tag `next`
- [ ] #3 Each package on npm trusts only the release workflow and environment of this repository and disallows publication by token, and the repository stores no npm token
- [ ] #4 The owner steps on npmjs.com (organization, placeholder first versions if npm needs them, trusted publisher per package) are written down in the order they must be done
<!-- AC:END -->
