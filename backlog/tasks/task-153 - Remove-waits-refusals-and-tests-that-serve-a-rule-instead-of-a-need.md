---
id: TASK-153
title: 'Remove waits, refusals and tests that serve a rule instead of a need'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-06 14:09'
updated_date: '2026-09-06 14:20'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 305000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audit after ADR 0022 found behaviour that exists to satisfy a stated rule rather than a need a person or agent has. The lock's bounded wait was meant to let an agent wait out a person's short gesture hold before writing; it was never meant to make a person wait. Fail-closed view mode on a pane existed because an unclaimed agent write could take a person's canvas away, which ADR 0022 ended. Two recovery paths are broken by the rules they serve: the hold's printed remedy is a command the CLI refuses, and an approval's expiry must equal a constant exactly. Several tests are repository-policy tests of the kind AGENTS.md says are deleted on sight. Origin: TASK-152's follow-up audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane is editable as soon as it is connected and stays editable through a socket blip; only an agent claim or a genuine loss of contact longer than one reconnect puts it in view mode
- [ ] #2 A person's write behind another person's gesture hold is refused with BOARD_HELD without waiting the lock cap; an agent still waits out a person's hold
- [ ] #3 Lock release news is broadcast without the free-linger delay and panes do not flicker
- [ ] #4 Pane layout settlement waits only on the panes it asked to move and returns as soon as they re-report
- [ ] #5 The hold's printed and API recovery commands are runnable as printed (they name the board and satisfy --doing or are exempt from it)
- [ ] #6 An approval is valid when its expiry is after its creation and within the configured bound, not only when it equals the constant
- [ ] #7 A board name that matches a note byte for byte resolves without a readdir; a case-insensitive match still resolves and a collision is still reported
- [ ] #8 lock-source-policy.test.ts, the source-string-ordering half of write-boundary-policy.test.ts, five of the six one-write counting-proxy owners and the browser runner's argument-order and duplicate refusals are gone; the one-write invariant keeps one owner
- [ ] #9 The epoch manifest is one file written by one atomic rename with no lock file or second copy; an unreadable or inconsistent manifest is treated as no prior epochs, not as a poisoned store
- [ ] #10 Test budgets (the TEST_ constants) live in a test support module, not in src/shared/timing/timing.ts, and the reconnect constant's rationale matches ADR 0022
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server/engine: human-vs-human hold refuses fast (lock loop breaks when the blocker is another person's hold and the requester is human; agents keep waiting); remove LOCK_FREE_LINGER_MS and announce free at once; settleAfterLayout waits on the panes it moved; hold recovery commands name the board and pass the doing requirement; approval expiry validated as a bounded window; vaultPathFor byte-equal fast path. 2. UI: readOnly no longer depends on connected; view mode only for an agent claim or a loss of contact beyond one reconnect. 3. Tests: delete lock-source-policy, the indexOf half of write-boundary-policy, five one-write owners and their proxy if unused, the browser runner's order and duplicate refusals; update owners the changes touch. 4. Verify with focused owners, then the complete check isolated.

5. Epoch storage: one file, temp-write and rename, no lock, unreadable means no prior epochs; ADR 0019 notes the epoch mechanism is a workaround for a Codex thread-resume bug expected to be fixed upstream. 6. Move the 44 TEST_ constants to tests/system/support/timing.ts unchanged.
<!-- SECTION:PLAN:END -->
