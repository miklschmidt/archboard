---
id: TASK-158
title: Remove static file-content tests and mandate runtime behavior tests
status: Done
assignee:
  - '@codex'
created_date: '2026-09-07 00:38'
updated_date: '2026-09-07 00:51'
labels: []
dependencies: []
type: chore
ordinal: 310000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user explicitly rejects tests that police wording or static source contents. These create maintenance work without proving product behavior. Add the mandatory rule to AGENTS.md and remove static-content assertions while retaining actual runtime and wire-contract coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md contains the user requested mandatory rule against static file-content tests.
- [x] #2 Static source and documentation content tests are removed, and remaining mixed suites retain their runtime checks.
- [x] #3 Repository validation passes after the removal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory direct static source/document assertions. 2. Remove pure static suites and static cases from mixed suites, retaining runtime behavior. 3. Remove orphaned helpers and update affected test documentation, then run the complete gate.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the mandatory runtime-behavior test rule in AGENTS.md. Deleted five static-only suites, the catalogue source-scanning helper, static cases from mixed suites, and the duplicated policy fixture. Removed the deleted skills test from the fix script and updated its documentation. Preserved runtime, persistence, wire-contract, lint and type validation. The complete bun run check passes, including all 305 system tests and the controlled browser voice workflow.
<!-- SECTION:FINAL_SUMMARY:END -->
