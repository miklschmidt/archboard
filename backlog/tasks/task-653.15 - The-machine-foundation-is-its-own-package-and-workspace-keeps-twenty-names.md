---
id: TASK-653.15
title: The machine foundation is its own package, and workspace keeps twenty names
status: Done
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-20T18:12:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.07
  - TASK-653.14
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 15, second ticket (the split), of the archboard-deepen run. After the deepening, workspace still carries the machine foundation (installation, the state directory, atomic writes, the source checkout), which its callers, the model store among them, use apart from the place questions. It becomes @archboard/machine at layer 1. The settled design, every decision and its reason: the "Candidate 15, workspace: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-15-workspace.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: workspace (packages/workspace), the new @archboard/machine package, and the callers of installation, stateDir, writeFileAtomic, unlinkDurably, browserUrl, defaultArchboardUrl and handOff (the model store, apps/cli, apps/server and others).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on workspace and @archboard/machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 @archboard/machine sits at layer 1 with the four subpaths installation, state-dir, atomic-write and source-checkout, and every caller imports the foundation from it with no re-export left in workspace
- [x] #2 workspace has width 20, the twenty names of the deepening ticket, and its interface-width ceiling falls to 22; INTERFACE_WIDE clears on workspace
- [x] #3 @archboard/machine is 20 or fewer, and new outcome types stay unexported
- [x] #4 package-graph.test.ts and package-api.test.ts record the new package and layer, and the package descriptions name each job
- [x] #5 The split is a pure move: behavior, files written and CLI output are unchanged, and the test lanes pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git mv the four foundation files (installation, state-dir, source-checkout, atomic-write), their api files and the installation and source-checkout tests from packages/workspace to packages/machine, same internal layout.
2. Point every caller (and workspace's registry-file and language-servers) at @archboard/machine/*; no re-export in workspace.
3. Add packages/machine/package.json (four subpaths), trim workspace's exports and description; LAYERS machine: 1, package-api adopter, ceilings machine 7 and workspace 29 -> 22; lint messages, site.yml path filters, site/scripts/reference.ts, bun.lock and bun.nix.
4. Run every lane and the code check against deepen/module-depth.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Pure move on deepen/653-15-machine: installation, state-dir, atomic-write and source-checkout (with installation.test.ts and source-checkout.test.ts) moved by git mv from packages/workspace to packages/machine, internal layout unchanged; no code changed but import specifiers. installation.test.ts's stand-in checkouts and comment now name packages/machine.
Widths: @archboard/machine 7 names (installation; browserUrl, defaultArchboardUrl, handOff; stateDir; writeFileAtomic, unlinkDurably), ceiling 7, no types exported. workspace: code check 20 functions + 2 types, logic 837 (was 27 names, logic 1107 at the TASK-653.13 gate); ceiling 29 -> 22; INTERFACE_WIDE cleared on workspace. Machine has no vault module yet, so the code check does not measure it (logic about 270 by difference).
Records: package-graph.test.ts LAYERS machine: 1; package-api.test.ts adopter machine (runtime); interface-width-ceilings.json; both .oxlintrc messages name @archboard/machine/installation; .github/workflows/site.yml path filters add packages/machine/** (site/scripts/reference.ts reads RELEASE_PORT from it); bun.lock and bun.nix gain the package.
Vault left unchanged: the bindings of Installation (4FdKQJqK), State directory (Q1jP0WbC), Atomic file replacement (qTv7HuBw) and Source checkout (NG7OXLv9) and the Taking argv flow anchors still name packages/workspace paths (BINDING_PATH_MISSING, ANCHOR_PATH_MISSING) until the slice rebinds them and adds a machine package module.
Lanes: build, types, lint:all, format:check, bun-nix, test:modules (5393 pass, 1 skip), test:repository (187), test:system (228; voice-client-socket failed once under parallel load, passed alone 3x and on the rerun of the lane), test:solo (15), test:serial-browser (50 files) all pass. check code --fail-shallow-modules --base deepen/module-depth: no finding on workspace or machine; it exits 1 on INTERFACE_WIDE of Workbench transport, ui-kit and renderer, which the TASK-653.13 gate already reported.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The machine foundation (installation, state directory, atomic write, source checkout) is @archboard/machine at layer 1 with four subpaths and seven names, moved unchanged with its two test files. Every caller imports it from machine and workspace re-exports nothing; workspace is 20 code-check names (logic 837) under a ceiling of 22, and INTERFACE_WIDE clears on it. All lanes pass. The vault still binds the four moved files at their workspace paths; the slice rebinds them.
<!-- SECTION:FINAL_SUMMARY:END -->
