---
id: TASK-153
title: 'Remove waits, refusals and tests that serve a rule instead of a need'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-06 14:09'
updated_date: '2026-09-06 18:04'
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
- [x] #1 A pane is editable as soon as it is connected and stays editable through a socket blip; only an agent claim or a genuine loss of contact longer than one reconnect puts it in view mode
- [x] #2 A person's write behind another person's gesture hold is refused with BOARD_HELD without waiting the lock cap; an agent still waits out a person's hold
- [x] #3 Lock release news is broadcast without the free-linger delay and panes do not flicker
- [x] #4 Pane layout settlement waits only on the panes it asked to move and returns as soon as they re-report
- [x] #5 The hold's printed and API recovery commands are runnable as printed (they name the board and satisfy --doing or are exempt from it)
- [x] #6 An approval is valid when its expiry is after its creation and within the configured bound, not only when it equals the constant
- [x] #7 A board name that matches a note byte for byte resolves without a readdir; a case-insensitive match still resolves and a collision is still reported
- [x] #8 lock-source-policy.test.ts, the source-string-ordering half of write-boundary-policy.test.ts, five of the six one-write counting-proxy owners and the browser runner's argument-order and duplicate refusals are gone; the one-write invariant keeps one owner
- [x] #9 The epoch manifest is one file written by one atomic rename with no lock file or second copy; an unreadable or inconsistent manifest is treated as no prior epochs, not as a poisoned store
- [x] #10 Test budgets (the TEST_ constants) live in a test support module, not in src/shared/timing/timing.ts, and the reconnect constant's rationale matches ADR 0022
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server/engine: human-vs-human hold refuses fast (lock loop breaks when the blocker is another person's hold and the requester is human; agents keep waiting); remove LOCK_FREE_LINGER_MS and announce free at once; settleAfterLayout waits on the panes it moved; hold recovery commands name the board and pass the doing requirement; approval expiry validated as a bounded window; vaultPathFor byte-equal fast path. 2. UI: readOnly no longer depends on connected; view mode only for an agent claim or a loss of contact beyond one reconnect. 3. Tests: delete lock-source-policy, the indexOf half of write-boundary-policy, five one-write owners and their proxy if unused, the browser runner's order and duplicate refusals; update owners the changes touch. 4. Verify with focused owners, then the complete check isolated.

5. Epoch storage: one file, temp-write and rename, no lock, unreadable means no prior epochs; ADR 0019 notes the epoch mechanism is a workaround for a Codex thread-resume bug expected to be fixed upstream. 6. Move the 44 TEST_ constants to tests/system/support/timing.ts unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 8ba1aeae. Complete bun run check green in an isolated worktree (2657 module, 309 system, 9 repository, 19 browser owners). Root cause of the crash-replacement flake: the fake Codex reissued thread-1 from a replacement child and the epoch provenance check refused it; the old store's slow writes hid this. The fixture now continues its sequence across children. Kept promotion-delete-bridge-one-write as the one-write owner: composed multi-element operations are the only shape a single-body route cannot regress.

Review correction (be04bb5b): the hold's recovery commands single-quote a board name the shell would split or pair up (space, apostrophe); a plain word stays bare. Owner: board-version-conflict unit test with the board "owner's board"; held-board-recovery system owner still runs the printed commands.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-06 14:56
---
Ready for the maintainer's review; left In Progress on purpose.
---

author: @codex
created: 2026-09-06 16:24
---
Final independent review of 0d1706d06b21df1c72910a640dadad35cd37234a..28e148acd599f702fe895ed1519a6510322714da: [P2] src/runtime/engine/board-version.ts:159-162 interpolates legal board names without shell quoting into reload, overwrite and save-as recovery commands. Public validation accepts my board and owner's board. Bash splitting plus the public browser-show schema confirms the first reload command can target my instead of my board; the apostrophe case fails with an unmatched quote. AC5 is therefore incomplete. Quote the source, target and suggested save-as name consistently. Read-only reproduction needed no server. Task remains In Progress for correction. Verification at pinned TARGET in /tmp/archboard-final-review-28e148ac, confined state and memory-limited scope: lint, formatting, both TypeScript projects, frontend build and 2657 module tests passed. The complete check command stopped after 308 system passes and one public-start cleanup failure caused by inherited LOG_FILE_PATH; TASK-150.06 documents that this owner requires the variable unset. All 8 cases in that owner passed with LOG_FILE_PATH unset and confined XDG state. The 9 repository tests and full 19-owner serial browser lane then passed. No implementation files changed; this is a review, not a fix or acceptance. No live server or user vault used.
---

author: @claude
created: 2026-09-06 18:04
---
Codex finding on board-version.ts:159-162 validated and fixed in be04bb5b: source, target and the suggested save-as name are shell-quoted when needed (single quotes, the POSIX-literal form); "my board" and "owner's board" now print as one word each. Unit owner added; the recovery system owner still types the printed overwrite back.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A person's hold behind any holder refuses at once; a pane stays editable through a blip (contact lost after CONTACT_LOST_MS); lock release news is immediate; layout settlement waits only on moved panes; recovery commands run as printed; approvals are valid inside their window; byte-equal board names skip the readdir; the epoch manifest is one atomically renamed file with unreadable meaning no prior epochs; test budgets moved to tests/system/support/timing.ts; the grep and ordering policy tests, five one-write owners and the browser runner's order refusals are gone. Verified with the complete bun run check on 8ba1aeae.
<!-- SECTION:FINAL_SUMMARY:END -->
