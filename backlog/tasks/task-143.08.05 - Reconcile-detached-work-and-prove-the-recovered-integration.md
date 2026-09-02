---
id: TASK-143.08.05
title: Reconcile detached work and prove the recovered integration
status: To Do
assignee: []
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 02:02'
labels: []
dependencies:
  - TASK-143.08.04
  - TASK-143.08.06.05
  - TASK-143.06.03
  - TASK-143.06.08
references:
  - codex/task-143-144-workbench@ba1aacee
  - docs/agents/test-suite.md
  - docs/agents/boundaries.md
  - skills/archboard/SKILL.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08
priority: high
type: task
ordinal: 270000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reconcile the frozen detached descendants only after the OOM, generated-type, contract, mandatory-startup, browser-independent board-work, and existing legacy-injection recovery streams have finished. Preserve maximal heads until their unique behavior is accounted for. Port behavior onto the recovered integration tip; never merge a detached head wholesale or revive the rejected type, test, board-session, or browser-rendering designs. Preserve main-only TASK-145, TASK-146, and TASK-147 when the integration branch is later reconciled with main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The worktree inventory records exact base, head, owned task, review state, unique commits, overlapping ancestors, dirty files, and one keep, port, rebuild, or drop outcome for every registered worktree.
- [ ] #2 0e74cbaf is considered only as a narrow TASK-143.06.06 replay after the OOM gate; 3e1670af is preserved as thread-discovery behavior to reimplement against the recovered type seam; neither merges before its owning task has a fresh plan and review.
- [ ] #3 b0938164, 0ac9ef2d, 4e93e729, and 52b00a4d are rebuilt rather than merged because they depend on handwritten browser contracts, repeated validation, or excessive test scaffolding. Useful observable behavior is mapped to existing open tasks before their detached code is dropped.
- [ ] #4 8bac86bf is folded into recovery notes and dropped as a Backlog-only blocker. Patch-equivalent or superseded heads, including 0f1e5807 and duplicate or ancestor worktrees at 3e1670af, 54643b59, 70263cf7, and 6438d02e, receive no separate replay.
- [ ] #5 No worktree is removed until its maximal head has a durable ref and the user approves removal. The untracked src-DlBR1tzg.js bundle and unrelated worktree changes remain untouched.
- [ ] #6 The recovered branch preserves all integrated ba1aacee product behavior that still satisfies the corrected contracts, preserves main-only task records during later reconciliation, passes the complete applicable check under recorded memory limits with no orphan, and receives an independent fixed-range review.
- [ ] #7 Only after this task is Done are paused TASK-143 and TASK-144 leaves reassigned and given fresh implementation plans. This recovery does not implement the missing timeline, composer, queue, approvals, or voice UI.
- [ ] #8 The final recovered integration includes TASK-143.08.06.05 evidence: named board work and server rendering pass with zero browser clients, live-session control exists only under `archboard browser`, and the canonical tracked skill teaches that separation before paused feature leaves resume.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:43
---
Initial worktree decision snapshot, 2026-09-02: 074b and 19e3 at 3e1670af share one candidate-discovery behavior port; 4354 at 0e74cbaf is the only narrow replay candidate; fcea at b0938164 with ancestor 1807 at 54643b59 must be rebuilt; 4985 at 0ac9ef2d with ancestor 5a0e at 70263cf7 must be rebuilt; 6bad at 4e93e729 with ancestor 4e9c at 6438d02e must be rebuilt; 3eca at 52b00a4d must be rebuilt; 66d8 at 8bac86bf is Backlog-only and is folded then dropped; 1430701 at 0f1e5807 is patch-equivalent to integrated code and gets no replay. Preserve each maximal head with a durable ref before any user-approved removal. Older integrated heads and unrelated TASK-140, TASK-124, CI, main, and dirty worktrees are not mutation targets.
---
<!-- COMMENTS:END -->
