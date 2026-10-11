---
id: TASK-453
title: Make agent validation reproducible and record session completion rules
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 14:22'
updated_date: '2026-10-11 14:37'
labels: []
dependencies: []
references:
  - docs/design/2026-10-08-session-retrospective.md
type: enhancement
ordinal: 734000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The October 8 session relied on an external browser CLI, retried invalid skill paths, and closed with test failures until the user corrected its scope. Implement the authorized retrospective proposals for pinned tooling, macOS regression coverage, useful progress evidence, and agent guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The browser lane resolves a pinned repository-owned CLI and reports actionable prerequisite diagnostics without another project or ambient wrapper.
- [ ] #2 Hosted macOS coverage includes the sandbox startup regression and repaired platform-specific fixtures.
- [x] #3 Guidance limits skills/ to shippable repository-authored Archboard skills and records the requirement to repair reproducible normal-gate failures before closing.
- [x] #4 Authored repository navigation links resolve, and long test runs expose compact progress without reducing coverage or hiding failures.
- [x] #5 The complete local gate and scoped standards/specification reviews pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the previously exercised agent-browser 0.31.1 in this checkout, resolve its executable explicitly, and improve bounded prerequisite diagnostics.
2. Extend the existing macOS job with the startup regression and repaired platform fixtures.
3. Correct skill ownership pointers, add normal-gate completion and bounded-reading guidance to archboard-dev, and extend existing navigation link validation.
4. Emit compact structured browser-lane progress while retaining ordinary output, serial execution, cleanup, and exit status.
5. Run focused owners, the complete local gate, and parallel scoped standards/specification reviews.
No board is affected: these changes alter developer test tooling, CI selection, and agent documentation, not the product modules or relationships that the vault draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented pinned agent-browser 0.31.1 native resolution, prerequisite diagnostics, macOS owner selection, navigation links, completion guidance, and structured progress. Six scoped Standards/Spec reviews fixed findings in commits b9fe728c, fd7e800a, db5dfa80, 38129d13, bdab5a5f, and 5fe44e5a. Complete local gate: 4678 passing tests, zero failures, all 19 browser owners completed cleanup audits, final exit 0. Final lint, formatting, types, and 7 focused tests pass. Linux opener: 1 pass, 24 assertions. Linux tooling: 5 pass, 15 assertions. Dogfood structural check passes; code check reports the existing unrelated drawRequest anchor warning. No task commits changed bound product parts. Hosted macOS execution remains pending explicit approval to publish the reviewed branch.
<!-- SECTION:NOTES:END -->
