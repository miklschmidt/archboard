---
id: TASK-653.15
title: The machine foundation is its own package, and workspace keeps twenty names
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
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
- [ ] #1 @archboard/machine sits at layer 1 with the four subpaths installation, state-dir, atomic-write and source-checkout, and every caller imports the foundation from it with no re-export left in workspace
- [ ] #2 workspace has width 20, the twenty names of the deepening ticket, and its interface-width ceiling falls to 22; INTERFACE_WIDE clears on workspace
- [ ] #3 @archboard/machine is 20 or fewer, and new outcome types stay unexported
- [ ] #4 package-graph.test.ts and package-api.test.ts record the new package and layer, and the package descriptions name each job
- [ ] #5 The split is a pure move: behavior, files written and CLI output are unchanged, and the test lanes pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
