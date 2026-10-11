---
id: TASK-461
title: Hosted startup cleanup reaches the process group before timing out
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 16:16'
updated_date: '2026-10-11 21:29'
labels: []
dependencies: []
type: bug
ordinal: 808000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hosted run 38153663557 fails public cleanup-error takeover before the fixture spawns Codex. The fixture sets a 350 ms readiness deadline before loading the server. Every process and cleanup assertion requires that child to exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A constrained reproduction identifies why the fixture exits before the Codex marker.
- [ ] #2 Every process identity and cleanup assertion remains intact, and any timing exception receives exact user approval before implementation.
- [ ] #3 The complete local and hosted gates pass with all normal owners.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected because the investigation concerns a test fixture. Preserve the hosted log and reproduce delayed startup in an isolated checkout. Prepare a concrete patch and measure it without changing the working branch. Keep cleanup deadlines and process assertions. Request exact approval if a test timing contract must change. Run unchanged hosted Linux again to distinguish a repeatable fixture failure from runner variation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The exact hosted failure occurs before the Codex marker. A scratch checkout adds a controlled 450 ms server-only preload delay. The original test reproduces the failure at 1102 ms. A two-line proposal changes readiness 350 to 2000 ms and complete startup-plus-cleanup ceiling 2000 to 5000 ms. It passes all nine assertions in 2.62 seconds with the same delay. Cleanup deadline 900 ms, grace 150 ms, and case limit 20000 ms remain unchanged. The patch is /private/tmp/archboard-retro-startup-proposal.patch and is NOT applied to the repository. Exact user approval is pending under the supplied AGENTS.md validation rule. Hosted Linux is rerunning unchanged. The fresh macOS job passes all 138 tests.

The user approved the timing change on 2026-10-11 ('Yes i approve, just get it fixed'): readiness 350 to 2000 ms and the startup-plus-cleanup ceiling 2000 to 5000 ms in tests/system/process-contracts/server-startup-signal.test.ts. Cleanup deadline, grace, case limit and every process assertion are unchanged.
<!-- SECTION:NOTES:END -->
