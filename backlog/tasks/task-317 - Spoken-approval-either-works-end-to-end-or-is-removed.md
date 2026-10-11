---
id: TASK-317
title: Spoken approval works end to end
status: To Do
assignee: []
created_date: '2026-09-23 21:35'
updated_date: '2026-10-11 13:55'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/runtime/codex-spoken-approval/lib/gate.ts
  - src/ui/workbench-approvals/lib/vocabulary.ts
priority: medium
type: bug
ordinal: 549000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The spoken approval gate (src/runtime/codex-spoken-approval) is built and composed into the canvas, and the coordinator is offered `resolve_spoken_approval`, but nothing in production ever calls the gate's `arm`; only test fixtures do. So the tool can only refuse with "There is no pending spoken approval to resolve." In the 2026-09-23 23:15 session the user said "just decline it" about the workhorse's pending command approval and the coordinator got that refusal.

Decision (user, 2026-10-11): spoken approval is wanted, so it is wired up, not removed. Why: Codex's auto-reviewer (TASK-314) sometimes denies a request that should escalate to the user, and the user wants to approve or decline that request by voice. The earlier argument for removal (auto-review means approvals rarely reach the user) does not hold, because the requests that do reach the user are the ones where the auto-reviewer should not decide alone. Until `arm` is called in production, the tool misleads the coordinator and the user, and the workbench still says an approval can be answered aloud.

Open question for the plan: how a request that the auto-reviewer denied reaches the user as a pending approval that the voice model reads out. Find that out first, from the Codex app-server approval flow and the code in src/runtime/codex-approvals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The workbench no longer tells the user an approval may be answered by voice unless that works
- [ ] #2 A pending approval that the voice model read out can be accepted or declined aloud and settles on the workbench, proven by one owner
- [ ] #3 A request that the auto-reviewer would deny but that should reach the user is offered to the user as a pending approval that voice can settle, proven by one owner
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit and user decision: kept open and wired up, not removed. Facts verified by the audit: nothing in production calls the gate's arm (only src/runtime/codex-spoken-approval/tests/gate.test.ts and a fixture that throws); the tool is still offered (src/runtime/codex-coordinator-tool-contract/archboard-voice.json, lib/manifest.ts:46); both prompts carry approval rules (coordinator-developer-instructions.txt:21, voice-prompt.ts:58); the workbench says 'You can answer aloud; the voice agent decides what it heard.' while voice is live (ApprovalCard.tsx:117, workbench-approvals/lib/vocabulary.ts:68, offers.ts:272). The audit effort for removal was M-L; wiring is not yet estimated.
<!-- SECTION:NOTES:END -->
