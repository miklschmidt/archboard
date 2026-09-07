---
id: TASK-160
title: Restore the sparse inspection capacity regression check
status: To Do
assignee: []
created_date: '2026-09-07 13:49'
labels: []
dependencies: []
references:
  - src/runtime/board-inspection/tests/sweep-filtering-capacity.test.ts
  - TASK-151
priority: medium
type: bug
ordinal: 312000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The opt-in inspection capacity owner fails in the sparse prefilter case: for 1,000 semantic nodes and 1,000 distant connectors it expects 6,000 broad-phase events but reports 7,000. This was reproduced both on TASK-151 at aaa06570 and its pre-remediation baseline e985590a during review on 2026-09-07. The failing owner prevents maintainers from getting a useful capacity-lane signal. Diagnose whether the extra pass reflects intended detector coverage or unintended work before changing the assertion. Reproduce with bun test src/runtime/board-inspection/tests/sweep-filtering-capacity.test.ts --test-name-pattern "keeps coarse sparse prefilter peaks constant".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The extra sparse broad-phase events are explained against the detector passes and the intended runtime behavior.
- [ ] #2 The existing sparse capacity owner passes for every fixture size while preserving meaningful bounds on work and retained state.
- [ ] #3 The relevant capacity lane passes without disabling or weakening coverage to hide a product regression.
<!-- AC:END -->
