---
id: TASK-634
title: 'Dissolve the timing package: each duration lives with its owner'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-13T04:12:00Z'
updated_date: '2026-11-13T04:36:00Z'
labels:
  - refactor
  - architecture
dependencies: []
ordinal: 1078000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
packages/timing holds every product duration, grouped by owner, in one package that hides nothing. Almost every group has one owner, so the package only moves constants away from the code that reads them, and its interface-width ceiling grows with each new owner (PR #115 raised it to 38). The comments beside the keys name what each duration pulls against, but nothing checks those relations. Every package sits exactly at its width ceiling, so a value that crosses a package edge adds a name. The user approved raising exactly those ceilings, by the names that single-owner exports add, and asked for no duplicated constants.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/timing and every path to it are gone: workspace manifests, bun.lock, bun.nix, lint and TypeScript configuration, the package graph layers, the width ceilings, CI path filters, the site and the vault model
- [ ] #2 Each duration group is private to the package or app that owns it, in its own constants file; a group is exported only when another package reads it, and no value is defined twice
- [ ] #3 Every real cross-owner relation named in a pulls-against comment is checked by an import or a test; the others are reworded so no comment claims an unchecked constraint
- [ ] #4 A ceiling rises only by the duration names its package now exports; the timing entry is removed
- [ ] #5 Every duration keeps its value
- [ ] #6 docs/agents/boundaries.md and the ADRs that named the timing package are updated, and a new ADR records the decision and supersedes the earlier one
- [ ] #7 bunx vp run check:all and bunx vp run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move each group beside its owner, with Object.freeze in place of the durations() helper: model (lock and claim), server-lifecycle, process (Git, interrupt grace, group poll), codex-app-server (process and session), codex-realtime-voice (realtime, approvals, tab grace), workbench (pane, shell clock, voice, subtitles), renderer (raster, far-view swap, flow cap), walkthrough (recording, replay, recorder), code-intel, telemetry, skills, apps/cli (vault fetch), apps/web (exploring, columns, picture, presentation, model cache).
2. Export a group only where another package reads it; process receives the Codex TERM grace and freeze from codex-app-server as arguments.
3. Check each real cross-owner relation with an import or an owner test.
4. Remove packages/timing and every path to it; adjust ceilings and the package graph.
5. Update boundaries.md, ADRs (new ADR supersedes the timing part of ADR 0016), the site, the vault through a proposal.
6. Gate: bunx vp run check:all and bunx vp run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved every group to its owner and replaced durations() with Object.freeze({...} satisfies Record<string, number>), which keeps each key typed as number. 17 names exported across 8 packages (model 2, process 3, codex-app-server 2, codex-realtime-voice 3, server-lifecycle 1, workbench 3, renderer 1, walkthrough 2); timing 38 removed, net width -21, approved by the owner. Registry lock in workspace has its own REGISTRY_LOCK_MS (workspace sits below model). Relation checks: codex-app-server, codex-realtime-voice, workbench, server-lifecycle, apps/cli and apps/web constants tests; RECORDER_MS.stall/frameCall, SKILL_EVAL serverShutdown and the failed-start cleanup are computed from the owner export. Voice npm bundle: GIT_MS marked pure so the bundle drops it. Vault: proposal ostXM9oe (removes module timing and 4 relationships, fixes 2 descriptions) adopted. Gate on e3a304369e: bunx vp run check:all and bunx vp run test pass; site build passes and the orb and live window draw.
<!-- SECTION:NOTES:END -->
