---
id: TASK-459
title: The git opener watchdog owner does not read Bun's output wording
status: Done
assignee:
  - '@implementer'
created_date: '2026-10-11 14:15'
updated_date: '2026-10-11 15:51'
labels:
  - testing
dependencies: []
priority: low
type: bug
ordinal: 805000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/process-contracts/git-opener-sequence-watchdog.test.ts asserts that each owner file name appears in Bun's output. Bun 1.4.2 does not print file names when its output is not a terminal, so the test fails at HEAD (found 2026-10-11 while auditing TASK-154). It also depends on output wording, which docs/agents/test-suite.md and the repository test policy discourage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The watchdog proves its contract (a stuck Git opener sequence is ended and reported) from structure, exit status or side effects, not from Bun's output wording
- [x] #2 The owner passes under the lane that runs it, in a terminal and when piped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: the watchdog test is its own wrapper (run by test:opt-in:tooling, not test:system). Its owner run now asks Bun for --reporter=junit --reporter-outfile in a temp dir and asserts exit 0 plus at least one test per owner file from the report's top-level suites, instead of owner names in Bun's text.

This record used TASK-454 on main. The supported Backlog doctor repair assigns TASK-459 after its collision with the independent wide-layout repair. Historical main commit references retain the former number. The original task content and completion evidence remain unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
tests/system/process-contracts/git-opener-sequence-watchdog.test.ts reads per-owner test counts from Bun's junit report file instead of owner names in stdout/stderr. Verified: 3 runs with stdin/stdout piped (3 pass, 0 fail each), 1 run under a pty via script (3 pass, 0 fail); type-check and tests lint pass.
<!-- SECTION:FINAL_SUMMARY:END -->
