---
id: TASK-097
title: Audit the checks for waits that are intervals rather than conditions
status: To Do
assignee: []
created_date: '2026-08-22 17:47'
updated_date: '2026-08-23 01:23'
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
Re-scoped on 2026-08-23. It was filed as "check-live-session does not survive being run alongside other suites", which is no longer true and was never the cause.

**What it turned out to be.** TASK-099: a person's edit could be lost between the pane's scene and its baseline through three separate routes, and the check was correctly reporting it. Load made the collision likelier, so the symptom looked like contention. With that fixed, `check-live-session` was run three times with `boards`, `lock` and `mcp` deliberately running alongside it, and failed **none** — against the behaviour that prompted this task.

So the contention framing is retired. What survives is the second criterion, and it has earned its own task twice over.

## Waits that are intervals, not conditions

Three separate defects this month were a check waiting a fixed period instead of waiting for the thing it cared about, and each one lied in a different direction:

- **The fail-closed assertion** killed the canvas, slept 1.5 s and read the pane. On a CI runner the process had not finished dying, so the socket was still open and the pane was still correctly connected — and the check reported a fail-open that had not happened. Fixed in `379aeca` by waiting for the process to exit, then polling.
- **A retyped label's width** was measured in the page before Excalifont had loaded. Chrome's fallback gives 78.87 where the server measures 107.82, and the two never reconcile because the server re-measures on every write. Found while verifying TASK-099; now waits until the page's measurement agrees with `measureLineWidth` within the measurer's epsilon.
- **This task's own subject**, which spent its life recorded as contention because the wait that ran out was blamed rather than the edit that vanished.

A fixed wait passes on a fast machine and fails on a slow one, which makes it indistinguishable from a real intermittent bug — and this project has now spent real time on exactly that confusion. CI runs all 25 suites on every push on a shared runner, which is the slow machine.

## The work

Go through the checks and find every wait that is a duration rather than a condition. For each: replace it with a poll on the thing actually being waited for, bounded and with a message naming what never became true — or leave it and write down why the duration is the right thing to wait for, which is sometimes true (a settle window's whole subject is elapsed time).

`scripts/check-live-session.mjs` and `scripts/check-typed-text.mjs` already have examples of the polling shape to copy. `src/core/timing.ts` holds the timing constants and the tensions between them; a check that hard-codes its own copy of one is the same defect from another direction, and TASK-066 found one of those already.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every wait in scripts/ is a poll on a condition, or carries a written reason why a duration is what it is waiting for
- [ ] #2 A bounded wait that runs out says what never became true, rather than failing on the assertion downstream
- [ ] #3 No check hard-codes its own copy of a timing constant that src/core/timing.ts owns
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-099 measures this family standalone and the diagnosis above needs qualifying. It reproduces one run in ten with nothing else on the machine, and the wait it blames is already a condition with a six-second budget rather than a fixed window — the check runs that budget out and the two documents never converge. Contention raises the rate; it is not what makes it possible. The divergence is a real lost edit, which is TASK-099.

TASK-099 found the mechanism behind the load dependence, and it is in the pane rather than in the check.

A report that came due while one was in flight was dropped with nothing rescheduled. If the answer then came back naming a hand that had moved, no document was applied, so nothing else armed a report either, and the edit was owed to the server with nothing left that would ever say it. Reaching it needs a round trip longer than REPORT_DEBOUNCE_MS, which is what a loaded machine produces — so the load dependence this task recorded is real, and the cause is a lost edit rather than a convergence window being missed.

It is fixed and it is now a check rather than a rate: check-live-session holds one report's answer back for a debounce and a half, lands a second drag in between, asserts the collision happened and then asserts both drags are on the board. Reverting the fix fails three of its checks.

What is left of this task is its own acceptance criteria: whether the check survives running beside the rest of the suite on a loaded machine, and whether its waits are conditions or justified fixed windows. The diagnosis above needs the correction rather than the retraction.
<!-- SECTION:NOTES:END -->
