---
id: TASK-143.08
title: Recover the TASK-143 and TASK-144 integration before feature work resumes
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:35'
updated_date: '2026-09-02 02:20'
labels: []
dependencies: []
references:
  - docs/agents/boundaries.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/agents/test-suite.md
  - codex/task-143-144-workbench@ba1aacee
  - docs/adr/0009-every-call-names-its-board.md
  - skills/archboard/SKILL.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143
priority: high
type: task
ordinal: 258000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stop the audited integration at ba1aacee and recover it before any text, voice, or other feature leaf resumes. The audit found an OOM-producing whole-project TypeScript analysis loop, unawaited compiler shutdown, a 29,220-line fingerprint corpus guarding unused ignored output, handwritten protocol and browser types that already drift from Codex 0.151.0, repeated validation and test systems, unconditional startup failure paths, stale legacy-injection material, and detached descendants based on the rejected contracts. This is forward recovery work only. Completed task records remain historical and untouched, although this recovery may delete or supersede mechanisms they introduced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The OOM-producing validation mechanism is removed and the bounded repository gate is trustworthy before any other recovery or feature implementation starts.
- [ ] #2 Ordinary compilation derives every used Codex wire view and local parser contract from the exact generated 0.151.0 types, with one named conversion seam for genuine local models.
- [ ] #3 Duplicate wire, browser, validation, helper, and test owners are collapsed or deleted while retaining direct coverage of reachable behavior through production module interfaces.
- [ ] #4 Mandatory Codex startup fails atomically and actionably for missing or invalid runtime prerequisites, and the retired legacy injection path no longer survives in current code or guidance.
- [ ] #5 Every registered descendant worktree has a recorded keep, port, rebuild, or drop decision; only recovered work is integrated; bounded full validation and independent review pass before feature tasks resume.
- [ ] #6 The exact Codex package is a runtime dependency, and one Archboard server owns at most one live or starting codex app-server instance; any crash replacement is serialized after complete reaping, with no reload or concurrent-start overlap.
- [ ] #7 Persisted-board commands are browser-independent and resolve named vault notes directly; all live pane, selection, camera, displayed-board, and user-session control is isolated beneath the explicit `archboard browser` surface, with server-owned rendering and matching canonical skill guidance.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Complete TASK-143.08.01 as the exclusive first recovery leaf and obtain an independent clean review.
2. Run TASK-143.08.02 through TASK-143.08.04 serially; after .08.01, allow the disjoint .08.06.01 renderer investigation and eligible legacy cleanup.
3. After .08.04 and .08.06.01, run .08.06.02 through .08.06.05 in dependency order.
4. Complete the single current-documentation leaf TASK-143.06.08 after legacy cleanup, lifecycle recovery, and browser-independent board work.
5. Run TASK-143.08.05 as the terminal reconciliation, bounded validation, and fixed-range review gate before resuming feature leaves.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-02 01:59
---
Recovery release order, 2026-09-02: TASK-143.08.01 remains the exclusive first action. Once its memory-safe gate is Done, the Codex recovery chain and TASK-143.08.06 may proceed within explicit isolated ownership. TASK-143.08.05 is the terminal reconciliation gate despite its lower numeric suffix and cannot start until TASK-143.08.04, TASK-143.08.06.05, TASK-143.06.03, and TASK-143.06.08 are Done.
---

author: @codex
created: 2026-09-02 02:14
---
Post-review release-order correction: TASK-143.08.01 remains the only implementation allowed first. After it is Done, TASK-143.08.02 through TASK-143.08.04 form the serialized Codex recovery chain while TASK-143.08.06.01 may investigate the renderer boundary. TASK-143.08.06.02 waits for both TASK-143.08.06.01 and TASK-143.08.04, then TASK-143.08.06.03 through TASK-143.08.06.05 run in order. TASK-143.06.08 is the single final current-documentation gate after the remaining legacy leaves, recovered lifecycle, and browser-independent board work. TASK-143.08.05 waits only on that transitive gate and is terminal. This comment supersedes comment #1 where its dependency list differs.
---
<!-- COMMENTS:END -->
