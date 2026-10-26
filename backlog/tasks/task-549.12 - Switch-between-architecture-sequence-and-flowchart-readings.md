---
id: TASK-549.12
title: Switch between architecture, sequence, and flowchart readings
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T19:24:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
  - TASK-549.11
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 12.

## What to build

Readers need structural and behavioral explanations without inferring execution order from dependencies.

A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05, TASK-549.11
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.
- [x] #2 Behavioral readings include all required participants and steps, including those outside the prior scope. Structural filters do not remove flow messages.
- [x] #3 Returning to architecture restores the prior reading. No selection of structural relationships invents execution order.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep grammar and explicit flow selection in the existing per-pane router address. Preserve architecture scope, focus, and filters when switching modes.
2. Reuse the complete canonical read and existing browser renderer. Offer flows that touch current selected subjects or scope, including descendants and relationship endpoints. Always require an explicit flow choice and preserve unavailable identities.
3. Draw the complete selected flow with every required participant and step. Structural relationship and group filters remain architecture presentation and do not remove behavioral content.
4. Add visible mode and flow controls, accessible selection and details, and explicit empty, missing, loading, failure, and recovery states. Keep selection and camera independent of rendering.
5. Use short TDD slices through the approved browser seam with real files and the public runtime. Cover relevant-flow choice, both behavioral grammars, all participants, architecture restoration, history, and unavailable flows.
6. Maintain Browser application@TASK-549.12 and any further affected proposals. Update ADR0060, consumer guidance, frontend contracts, coverage, and test ownership. The common agent investigation contract remains TASK-549.13.
7. Run focused browser regressions, types, lint, formatting, architecture checks, and existing contract owners as needed. Inspect the rendered workflow and simplify ownership.
8. Merge latest integration, adopt accurate proposals, release claims, stop the server, close proven criteria, and provide a signed source to the required merger.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent frontend work starts in isolated checkout /home/msc/Projects/archboard.feat-module-diagram-modes from integrated5432fed897cd0b7bcbb8ada2c41dabd533305cca. Dependencies .05 and .11 are Done and integrated. Parent owns all frontend. The approved browser and public runtime seams remain unchanged. No model evaluation, dependency installation request, or scope expansion is required.

Browser application@TASK-549.12 is draft at version172. The proposal describes per-pane grammar/flow addresses, complete behavioral projections, relevant explicit flow choices, and preservation of architecture scope/focus/filters. The existing renderer already supports all three grammars, so no renderer architecture or API addition is planned. Worktree server12686 is ready at PID1128291. Dependencies install successfully.

First grammar slice passes its RED-to-GREEN browser owner: one case and seven assertions. The reader chooses among relevant flows, draws complete sequence and flowchart content outside the prior scope, preserves structural filters without removing messages, and restores architecture scope/focus/filter addresses. Source/frontend types and full lint pass. The browser owner waits until the menu option is the actual hit target before clicking. Missing-flow recovery, history/reload coverage, behavioral selection details, final documentation, visual inspection, architecture adoption, and closure remain incomplete.

The behavioral-selection regression first failed because an existing hidden step appeared missing. It now passes within the mode owner, one case and nine assertions. Complete subject lookup includes flows and nested steps. The inspector offers separate explicit flow actions for hidden behavioral selections. Structural Focus refuses behavioral subjects, and reveal preserves selection. The original scope camera remount remains, with deliberate grammar/flow changes framing their own scene. Corrected lint passes. Missing-flow/history coverage, final checks, visual inspection, and adoption remain open.

Final evidence: ten distinct browser cases and71assertions pass. Modes2/17, navigation3/19, selection1/5, focus1/9, filters1/6, gestures1/6, and structural refresh1/9. Exact history, empty flow choices, deletion/restoration, stable selection across modes, explicit per-flow reveal, and unchanged revisions pass. Visual inspection found participant order differed from sequence columns; the regression failed and now passes with authored order. Source/frontend types, full lint with zero findings, formatting, evaluation metadata, and git diff --check pass. No package public API or shared semantic rule changes require repeating their already passing owners. Browser application@TASK-549.12 is adopted at version174. Thirty prior variant meanings, views, and decisions remain intact. Proposal code checks have zero warnings; ten known unrelated warnings remain elsewhere. Semantics has zero findings. Parent inspected sequence, flowchart, and architecture renders. Temporary screenshot calls are removed. The simplification pass preserves the existing renderer, one router authority, one selection owner, and shared controls. The common missing-flow investigation action remains approved TASK-549.13. No push, full-gate success, or whole-spec completion is claimed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Readers choose Architecture, Sequence, or Flowchart through the existing local renderer. Behavioral modes require an explicit relevant flow and include every participant and step in authored order. The preceding architecture scope, focus, and filters return unchanged. Flow and step selections remain known across modes, with explicit reveal actions. Exact addresses survive browser history and reload; missing flows remain explicit and recover when restored. Browser evidence, types, lint, metadata, architecture checks, and consumer documentation match delivery.
<!-- SECTION:FINAL_SUMMARY:END -->
