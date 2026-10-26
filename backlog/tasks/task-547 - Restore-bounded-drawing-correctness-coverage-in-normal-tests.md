---
id: TASK-547
title: Restore bounded drawing correctness coverage in normal tests
status: Done
assignee:
  - '@codex'
created_date: '2026-10-26T02:05:00Z'
updated_date: '2026-10-26T02:14:00Z'
labels: []
dependencies: []
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moving the growing renderer corpus into benchmarks removed its broad drawing assertions from ordinary development. A fixed representative set must retain useful correctness coverage without vault growth or speed gates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Normal module tests render a fixed representative set on both engines and assert completeness and drawing clearance without speed assertions.
- [x] #2 The full dynamic vault corpus remains opt-in through the benchmark command.
- [x] #3 The fixed correctness cases pass and documentation explains their scope.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse the three existing wide-board fixtures as six fixed correctness cases. Share drawing assertions with the benchmark owner. Leave dynamic vault discovery and timing assertions in benchmarks. Run focused cases and the normal gate. Runtime boards remain accurate because only test ownership changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added six fixed cases using Flask dependencies, dense system map, and nested public API fixtures on both engines. The focused file passes 48 assertions in 1.45 seconds locally. Shared assertions preserve all existing benchmark correctness checks. Normal bun run test passes all seven tasks including 19 browser owners. Targeted benchmark passes both engines. Lint passes without warnings. Full check stops only at the known 60 third-party skill formatting errors. Simplicity pass reused existing fixture inputs and assertion code with no new runner or suite configuration. No runtime board or consumer skill changes are needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored fixed drawing correctness coverage to ordinary module discovery without vault enumeration or speed assertions. Full corpus performance work remains opt-in. Normal tests and focused benchmarks pass; the known third-party formatting issue still blocks the combined gate.
<!-- SECTION:FINAL_SUMMARY:END -->
