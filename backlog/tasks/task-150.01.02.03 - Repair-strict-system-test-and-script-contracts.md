---
id: TASK-150.01.02.03
title: Repair strict system-test and script contracts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 04:44'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/test-suite.md
  - docs/agents/strict-analysis.md
parent_task_id: TASK-150.01.02
priority: high
type: task
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repair retained test/support/script compiler and lint contracts after checkpoint f9cee0b09d6630693412abb31d9763e8e4ae9a86 while preserving real assertions and process cleanup. Own tests/system excluding repository-policy, and scripts excluding generate-* and probe-server-rendering-* files. Primary repair owner retains policy/generation/probes and broad validation. Visible Daybreak low work only. Browser source may receive behavior-preserving compiler fixes; every behavioral rewrite, assertion deletion, selector change or transfer requires prior individual coordinator approval and browser execution remains deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Assigned retained source passes full applicable strict compiler/lint policy, with preserved assertions and cleanup semantics and no blanket suppressions.
- [ ] #2 Relevant focused non-browser test/support checks pass; no browser owner, smoke, suite or aggregate invoking browser tests executes.
- [ ] #3 Each proposed browser behavioral, interaction, assertion, selector, deletion or owner-transfer change receives prior case-by-case coordinator approval; none is self-approved.
- [ ] #4 Stay inside exact ownership exclusions and report HEAD, evidence, local exceptions and risks; commits are serialized and formal finalization remains after final review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect coordinator compiler logs and isolate diagnostics to owned tests/system and scripts paths.
2. Repair compiler contracts first without changing assertions, browser behavior, process sequencing, or cleanup.
3. Run scoped lint to inventory remaining owned violations; repair at owning test/support/script contracts, including meaningful splits for physical-line limits.
4. Run focused non-browser checks and scoped lint, audit preserved shared-checkout work, and report exact evidence and remaining risk to the coordinator. Broad compiler/lint/test validation remains with the primary owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 2026-09-05 at HEAD f9abd7cb95a228887d729c4258b8cdd3dedae019: fresh serialized root compiler reduced owned diagnostics to one ApplyReceiptView/Zod exact-optional mismatch; repaired it as document?: ElementIdView[] | undefined without a cast or runtime schema change and requested primary revalidation. Earlier 13 owned compiler failures were repaired by omitting absent RequestInit/pane/process options and accurately typing parsed fixture/result shapes.

Scoped type-aware lint inventory covers 191 exact owned files and currently reports 6,849 diagnostics, down from 6,936. Sixteen files pass complete scoped lint individually; run-browser-lane has its 502-to-499 physical-line repair and max-lines now passes while its remaining lint debt is pending. Focused non-browser validation passes: package-limits/spoken-approval/variant-eval 4 cases, install-targets 8 cases, lock-source-policy 1 case, scratch-board 4 cases; sync-skills direct execution passes. server-rendering-failure is lint-clean but its focused owner stops at the missing derived dist/frontend prerequisite before reaching the intended missing-Chromium assertion; no assertion was changed. No browser execution occurred. No suppressions, config/package/generator/probe/policy changes, staging or commits. Remaining applicable lint is substantial and task stays In Progress.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-05 04:37
---
Worker started from released ownership baseline f9cee0b09d6630693412abb31d9763e8e4ae9a86; current shared-checkout HEAD eaad7c73413dc948e4239421269e381e186d2651. Scope and validation constraints accepted; no commit, browser execution, config/package/generator/probe/policy changes.
---

author: @codex
created: 2026-09-05 04:44
---
Coherent checkpoint sent to coordinator and primary commit owner with exact paths and evidence. Formal Done is not claimed: applicable owned lint remains, and the corrected final compiler diagnostic awaits the primary serial refresh.
---
<!-- COMMENTS:END -->
