---
id: TASK-616
title: archboard model snapshot writes a state and its comparison state to one file
status: In Progress
assignee:
  - '@claude'
created_date: 2026-11-09 01:20
updated_date: '2026-11-09T05:33:00Z'
labels:
  - cli
dependencies: []
references:
  - apps/cli/src/cli/commands/model/operations/read.ts
  - packages/model/src/shared/schemas/semantic-policy.ts
  - >-
    apps/web/src/ui/architecture-drawing/model-reader/hooks/use-model-comparison.ts
ordinal: 1062000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reader can explore a model only through a running Archboard server today. A team that wants to share one state of its architecture outside the app, for example on a documentation site or beside a pull request, has no file to hand over. A snapshot file carries everything the canvas needs to draw one state and its comparison state: the model reading, the comparison reading, the policy and diagnostics of the vault check, and the paths of the icons that the policy names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard model snapshot --out <file> writes one JSON file with the model reading of the selected state, the reading of its comparison state when it has one, the vault check result and the icon paths that the policy names
- [ ] #2 The command takes the same selection options as model read: --state, --against, --model and --flow
- [ ] #3 The file records a snapshot format version and the version of the CLI that wrote it
- [ ] #4 A package export holds the snapshot schema, so a reader of the file can parse it
- [ ] #5 Two runs on an unchanged vault write the same bytes
- [ ] #6 The CLI command audit includes the command
- [ ] #7 A system test writes the snapshot of a fixture vault and parses it with the exported schema
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add ModelSnapshotSchema to @archboard/model/contract: format 1, cliVersion, reading, comparisonReading (null when the state compares nothing), check (VaultCheckSchema), icons (name to path data).
2. Add policyIconPaths to @archboard/renderer/bun, from the icon naming rule that the browser already uses, moved to shared/render/rules/policy-icons.ts so the browser and Bun share it.
3. Add archboard model snapshot (apps/cli/src/cli/commands/model/operations/snapshot.ts): the selectors of model read (--state, --against, --model, --flow) taken from its contract, --out required. Read the selected state, then its comparison state the way the canvas reads it, then the vault check of the selected state; validate with the schema; write compact JSON as a file receipt.
4. Keep both package interfaces at their width ceilings (ADR 0058): drop the derivable type export ArchitectureCheckpointRequest from the model contract, and replace RASTER_MIN_SCALE and RASTER_MAX_SCALE with one RasterScaleSchema that the rasterize command used to assemble.
5. Add the cli-command-audit.json entry, update boundaries.md, and document the new parts in this repository's model so check:model passes.
6. System test tests/system/models/model-snapshot.test.ts: a draft and its comparison, same bytes twice, parse with the exported schema, no comparison for current, a refused read writes no file.
<!-- SECTION:PLAN:END -->
