---
id: TASK-663.08
title: >-
  The model replaces call with sync and async, filters by effect, and joins only
  like lines
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T14:11:00Z'
updated_date: '2026-11-23T02:12:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
88% of relationships were the catch-all call, so pictures were one gray mass and the goal of retiring call was missed. The owner settled sync and async as the in-process kinds, effect switches beside kind switches, one-click lenses, and no mixed-kind lines (artifacts/t663-legend/spec.md sections 1, 3, 4, 6 and settled.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The built-in kinds are sync, async, http, rpc, event, queue, stream, spawn, render, storage and dependency, with the colors of the spec, and no kind sets the arrowhead
- [x] #2 A relationship, lens selector, --hide-kind or relationshipKinds entry naming call is refused with sync and async named
- [x] #3 Lenses are main, effects (Side effects), sync-compute (Sync compute), network, reads, dependencies and all, in that order
- [x] #4 hideEffects with tokens mutation, query, compute and declared filters after the lens, and the address, recipe and CLI --hide-effect carry it
- [x] #5 Relationships join into one line only when they share kind and effect
- [x] #6 An old address or recipe with hideKinds=call reads as sync and async
- [x] #7 The upgrade inventory seeds sync or async from code facts and leaves the rest blank
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Policy: built-in kinds sync and async replace call, spec colors, no arrowhead on authored kinds (optional on readings); lenses main, effects (Side effects), sync-compute, network, reads, dependencies, all; refuse relationshipKinds.call and lens selectors naming call with sync and async named.
2. A call-era vault (format 2 with call or arrowhead) reads read-only with UPGRADE_REQUIRED in its recorded vocabulary; an edit naming call is refused.
3. Filters: hideEffects (mutation, query, compute, declared) on the render request and projection beside hideKinds; hideKinds call reads as sync and async.
4. Lines join only within one kind and effect.
5. Upgrade: inventory keeps oldKind and effect, seeds sync or async from a call-site hook (awaited or started -> async, plain -> sync, else blank); configuration drops restated call and arrowhead, translates call lens selectors.
6. CLI --hide-effect and refusal of --hide-kind call; server routes and export frame carry hideEffects.
7. Tests with fixtures; types, lint, format.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in ea792e0f9f, 5d88e047d6, f9e8945a6d, 909bc41dba, 2a3f85eda5.
- Verified by: bun test packages/model/tests apps/server/tests apps/cli/tests. 760 pass. The 2 failures come from TASK-663.10's renderer marks.ts, which does not parse. The CLI refusals were run by hand: --hide-kind call names sync and async; --hide-effect bogus lists the four tokens. Source lint and format are clean in scope.
- Design: a vault that still names call, or whose kinds set an arrowhead, reads read-only (UPGRADE_REQUIRED) in its call-era vocabulary, with its old digests, so its drafts carry across the upgrade. The upgrade drops every relationshipKinds.call entry. A renamed call cannot name both sync and async, and refusing it would block every format-1 vault, which listed call whole. The current schema refuses relationshipKinds.call.
- Joining: lines join only within one kind, one effect and one comparison state. The model never emits the mixed kind; legacy overview readings still can.
- Built-ins moved to shared/schemas/built-in-vocabulary.ts.
- AC4 is open: the web address (apps/web reading-routing) must parse hideEffects<pane>; that is TASK-663.11's scope. The render request, the recipe (same schema), the server render route, the pane reading schema and the CLI carry hideEffects. The system tests that render end to end wait for TASK-663.10's core to build.

AC4 verified on ec32ee706c: the address carries hideEffects<pane> (TASK-663.11, legend and filter browser tests pass); render and rasterize take --hide-effect and record hideEffects in the recipe (tests/system/models/model-render-context.test.ts passes in the system lane); a repeatable option with choices keeps every value (apps/cli parameters.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
sync and async replace call; hideEffects filters after the lens and travels in the address, recipe and CLI; lenses are main, Side effects, Sync compute, network, reads, dependencies and all; lines join only by kind and effect; old hideKinds=call reads as both; the upgrade seeds sync or async from code facts. Verified by the full gate on ec32ee706c (modules 5,270, system 231, solo 15, repository, browser lane) and four Sol reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
