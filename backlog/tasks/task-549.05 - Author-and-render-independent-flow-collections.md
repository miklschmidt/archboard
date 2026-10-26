---
id: TASK-549.05
title: Author and render independent flow collections
status: Done
assignee:
  - '@codex'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T17:53:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.04
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 5.

## What to build

A flow spans architectural responsibilities and cannot belong to one diagram document.

An agent creates and edits a flow spanning several modules, then renders it as a sequence or flowchart through an explicit flow selection.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.04
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent creates and edits a flow spanning several modules, then renders it as a sequence or flowchart through an explicit flow selection.
- [x] #2 Preserve participant order, messages, decisions, loops, notes, repeat counts, and evidence. Collection filenames impose no participant ownership.
- [x] #3 Steps retain identity across moves between flows and nested holders. Alternative renames move affected placements together. Missing holders and incompatible ordering fail explicitly.
- [x] #4 Returns remain messages without creating reverse structural relationships. Flow reference repairs participate in the same operation and claim calculation as module edits.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm integration base and publish the stable flow contract. Create TASK-549.05 proposals on Board persistence, Command interface, Archboard server routes, and Semantic renderer.
2. Use vertical tdd slices at the approved architecture read/write seam with real files and Git. Extend the existing batch, identity authority, claims, and durable transaction for collections, flows, steps, placements, reference repairs, and explicit conflicts.
3. Adapt explicit flow selection through existing server, CLI, and renderer operations. Save real CLI sequence and flowchart SVG evidence.
4. Update consumer examples, ADR0060, test ownership, and evaluation coverage. Run focused runtime/adapter tests, types, lint, formatting, architecture checks, and evaluation input validation. No model evaluation or review phase.
5. Simplify, merge latest integration, preserve architecture histories, adopt proven proposals, finalize demonstrated criteria, release claims, stop the server, and commit clean with signatures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed clean source and integration base 62853e30f78aa52473ed1ef69d9481920e166b2b. Public runtime seam and real temporary files/Git are already owner-approved. No frontend source, browser tests, child agents, pushes, or PR edits.

Early contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.05-contract.md. Proposals: Board persistence@TASK-549.05, Command interface@TASK-549.05, Archboard server routes@TASK-549.05, Semantic renderer@TASK-549.05. Saved nested flow meaning stays behind the existing edit candidate and durable transaction. Public runtime tests own identity, claims, placement, reference repairs, and real Git behavior; actual CLI SVG output owns transport and rendering evidence.

Runtime slices now prove collection creation, cross-module nested flow preservation, stable step moves, atomic alternative renames, explicit placement/order refusals, and same-operation module-removal repairs. Public read and retained reads expose explicit selectedFlow. CLI rendering reuses renderArchitecture with a grammar choice and keeps renderer exports at 60. A real missing-flow CLI refusal exposed unconditional artifact installation before nonzero outcome presentation; the existing execution operation now skips artifact installation for a declared failure.

Signed implementation checkpoint ea4deb3ea records the initial delivery. Simplification shares module/collection serialization and field assignment, and keeps placement and reference repair private to the existing candidate. Focused runtime/adapter/execution evidence passes 39 cases with 187 assertions. Real CLI evidence in task-549.05-evidence includes signed source and architecture commits, creation and editing, sequence.svg, flowchart.svg, exact retained-sequence.svg, stable retry, preserved source index, preserved refused output, and released fixture claims. Added Command dispatch@TASK-549.05 for the successful-artifact contract. Renderer width remains 60/60; the known board retirement gate is now 245/188 without any ceiling change.

Final evidence: 39 focused cases pass in task-549.05-focused-accepted.log; the final eight flow cases pass with 44 assertions in task-549.05-flows-final.log after the removal/move conflict slice. Another 81 regression cases pass with 691 assertions in task-549.05-regression-accepted.log. Source and frontend types pass. Full lint has zero warnings/errors, formatting passes, and evaluation inputs pass 21 scenarios/21 fixtures/14 parts. No model evaluation ran. All five proposal code scopes have zero warnings; ten known warnings remain outside scope. Original .04 registry, .17 archive/probe/state files and S20 inputs remain exact. The latest integration merge reports Already up to date at 62853e30f. Production rasterizer captures of actual CLI SVGs were inspected; both diagrams show the authored nested behavior and rasterizer cleanup is clean. No frontend source or browser test changed. TASK-549.12 owns later browser grammar switching.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agents can author independent flow collections and continuing nested steps through the existing durable batch. Explicit CLI/HTTP selection renders sequence or flowchart SVGs through the existing renderer. Complete claims, identity reservations, reference repair, exact retry, checkpoints and recovery remain in the shared runtime. Public runtime and real signed CLI evidence demonstrate all four criteria. Consumer guidance, example, ADR0060, glossary, architecture proposals and evaluation coverage match the delivery. The separate board export retirement gate remains 245/188 under TASK-549.24; renderer stays 60/60. Browser grammar controls remain TASK-549.12.
<!-- SECTION:FINAL_SUMMARY:END -->
