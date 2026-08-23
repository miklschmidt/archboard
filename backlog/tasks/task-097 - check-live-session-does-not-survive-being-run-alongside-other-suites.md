---
id: TASK-097
title: check-live-session does not survive being run alongside other suites
status: To Do
assignee: []
created_date: '2026-08-22 17:47'
updated_date: '2026-08-23 00:31'
labels: []
dependencies:
  - TASK-086
references:
  - scripts/check-live-session.mjs
  - .github/workflows/ci.yml
priority: medium
type: bug
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Diagnosed rather than guessed, from two independent sightings.

TASK-062's agent saw `check-live-session` fail twice early at cycle 12 with the same signature — an agent move and a human move disagreeing on one element's x and y — then pass 7 of 7 standalone and 4 of 4 in later full-suite runs. It could find no mechanism connecting the once-a-second stat sweep it had added to a 400 ms convergence window, and read it as a pre-existing flake under load.

TASK-095's agent then reproduced it deliberately: a chain run failed in live-session **because four other suites were running alongside it**, and its account is plain — that check drives a real browser and does not survive the contention.

So it is contention, not a mystery. The check waits on a 400 ms convergence window while a real browser renders; enough competing work on the box and the window is missed.

This matters more than a local annoyance. CI now runs all 23 suites on every push (TASK-082) on a shared runner, which is a more contended machine than this one, and a runner already proved it can schedule races this box cannot — it caught the fail-closed timing bug on the first push. An intermittent live-session is a red main nobody can reproduce.

Related to TASK-086, which is the same family — a check whose result depends on what else is running — though its cause was different (a canvas outliving the check that spawned it, and answering /health).

The fix is probably to stop waiting a fixed window: wait on the condition, the way 379aeca fixed the fail-closed assertion for exactly this reason. Establish that before changing anything.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-live-session passes when run alongside the rest of the suite on a loaded machine
- [ ] #2 Its waits are on conditions rather than fixed windows, or the fixed ones are justified
- [ ] #3 The contention case is reproduced deliberately before the fix, so the fix is shown to address it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-099 measures this family standalone and the diagnosis above needs qualifying. It reproduces one run in ten with nothing else on the machine, and the wait it blames is already a condition with a six-second budget rather than a fixed window — the check runs that budget out and the two documents never converge. Contention raises the rate; it is not what makes it possible. The divergence is a real lost edit, which is TASK-099.

TASK-099 found the mechanism behind the load dependence, and it is in the pane rather than in the check.

A report that came due while one was in flight was dropped with nothing rescheduled. If the answer then came back naming a hand that had moved, no document was applied, so nothing else armed a report either, and the edit was owed to the server with nothing left that would ever say it. Reaching it needs a round trip longer than REPORT_DEBOUNCE_MS, which is what a loaded machine produces — so the load dependence this task recorded is real, and the cause is a lost edit rather than a convergence window being missed.

It is fixed and it is now a check rather than a rate: check-live-session holds one report's answer back for a debounce and a half, lands a second drag in between, asserts the collision happened and then asserts both drags are on the board. Reverting the fix fails three of its checks.

What is left of this task is its own acceptance criteria: whether the check survives running beside the rest of the suite on a loaded machine, and whether its waits are conditions or justified fixed windows. The diagnosis above needs the correction rather than the retraction.
<!-- SECTION:NOTES:END -->
