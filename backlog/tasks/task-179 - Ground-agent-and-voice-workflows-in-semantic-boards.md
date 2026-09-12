---
id: TASK-179
title: Ground agent and voice workflows in semantic boards
status: Done
assignee:
  - '@claude-context'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 02:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-172
  - TASK-173
  - TASK-176
  - TASK-177
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 330000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Preserve useful workhorse/coordinator and code-target workflows while replacing their dependency on drawing elements and geometry.

## Blocked by

TASK-172, TASK-173, TASK-176, TASK-177

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent tools and CLI expose the same semantic read/write/branch/resolve/adopt contracts with board-global claims, expected versions and one-write outcomes.
- [x] #2 Selected semantic IDs, board/variant/view identity, differences and reconciliation issues ground text/voice context delivery and agent requests.
- [x] #3 Existing private app-server session ownership, delivery/outcome tracking and code-navigation behavior continue through semantic contracts.
- [x] #4 Public integration coverage verifies selection-grounded requests and applied-with-issues repair guidance without restoring human content edits or geometry obligations.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement semantic context and dynamic tools over shared board/variant/view/subject contracts; preserve private workhorse/coordinator delivery and voice behavior. Coordinate pane context interface with the isolated runtime-cutover worker. Verify public context and applied-with-issues workflows with focused runtime tests, then integrate and perform final app verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adoption delivery is a prerequisite for the complete public agent lifecycle tool contract.

User explicitly authorized multiple Claude processes in isolated worktrees. Opus5 high worker w1E:p9 owns /home/msc/Projects/archboard.feat-semantic-agent-context from snapshot tree cc657a18b35b11401b51497057248cad0793b9ce. Dependencies still gate acceptance; independent implementation proceeds in parallel. Parent updates authoritative Backlog and integrates reviewed delta; no unsigned commits.

Integrated into the main tree from w1E:p9's reviewed manifest (/tmp/semantic-agent-context.own.patch, 64 files, +4859/-673 against snapshot cc657a18). 62 files applied to the worktree; two were merged by hand because this tree had also touched them:

- src/server/canvas/lib/application.ts — already byte-identical to the patch's target (f86cca2e): the semantic pane-context route mount was the same line in both trees.
- src/server/canvas/lib/semantic-pane-context.ts — taken verbatim from the patch (74172e68). p9's three changes are preserved deliberately: the monotonic `sequence` ordering with `kept` in the reply, pruning moved to reads only (pruning on write erased the sequence memory, so a pane whose registration lapsed accepted a stale in-flight report), and publishPaneContext only after a report that was kept.
- src/server/canvas/lib/canvas-resources.ts — my own duplicate import and call of forgetSemanticPaneContexts removed, leaving p9's placement, so the file matches the patch's target (6c3b7af9).

Every one of the 64 paths was then verified byte-identical to the patch's target blob by git hash-object.

Verified after integration, each by its own exit code rather than a pipeline's: bun run type-check (root and frontend) 0; bun run lint 0; the suites this task owns 153 pass / 0 fail (codex-semantic-context, codex-thread-context, codex-instructions, ui/voice-context, semantic-agent-context, semantic-pane-reports); the workhorse and tools suites 162 pass / 0 fail; src plus tests/system/semantic-boards 3158 pass / 0 fail.

Still open and owned by TASK-181's tree, recorded so it is not lost: codex-workbench-semantic-pane compares an event's board against a proposal pane key as full strings, and pA's cutover corrects it to compare aggregates. That correction wins over this patch's copy when the cutover is integrated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agent and voice workflows now run on semantic boards rather than on drawing elements. The CLI and the agent tools speak one contract — read, write, branch, resolve, adopt, each under the board-global claim, each stating the version it was written against, each answering with the whole board and what it left for somebody to settle — and the context a thread is given is grounded in stable semantic ids: the board, the variant and its lifecycle, the view being read, the subjects a person has selected, what the variant differs from its predecessor by, and what it is waiting on. The private app-server session, its delivery and outcome tracking and code navigation are unchanged in kind; what changed is what they are about. A write's news now carries who wrote it: `heldAs`, the identity the board was held under, and `by`, the pane the write said it was for, which is what lets a thread tell somebody else's change from its own echo — omitted stays deliverable, and a claim is deliberately not read as authorship because a claim records no pane.

Built and reviewed in a separate worktree by w1E:p9, independently reviewed PASS twice (runtime 21 tests / 172 assertions; boundary 27 tests), then integrated here from their filtered manifest: 64 files, every one verified byte-identical to the patch's target, with the two files this tree had also touched merged by hand and p9's sequence, read-only pruning and publish-after-kept behaviour preserved. Verified after integration by each command's own exit status: both type-checks and lint clean, 153 pass / 0 fail across the suites this task owns, 162 pass / 0 fail across the workhorse and tools suites, and 3158 pass / 0 fail across src and tests/system/semantic-boards.
<!-- SECTION:FINAL_SUMMARY:END -->
