---
id: TASK-616
title: archboard model snapshot writes a state and its comparison state to one file
status: In Progress
assignee:
  - '@claude'
created_date: 2026-11-09 01:20
updated_date: '2026-11-10T15:15:00Z'
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
- [x] #1 archboard model snapshot --out <file> writes one JSON file with the model reading of the selected state, the reading of its comparison state when it has one, the vault check result and the icon paths that the policy names
- [x] #2 The command takes the same selection options as model read: --state, --against, --model and --flow
- [x] #3 The file records a snapshot format version and the version of the CLI that wrote it
- [x] #4 A package export holds the snapshot schema, so a reader of the file can parse it
- [x] #5 Two runs on an unchanged vault write the same bytes
- [x] #6 The CLI command audit includes the command
- [x] #7 A system test writes the snapshot of a fixture vault and parses it with the exported schema
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add ModelSnapshotSchema to @archboard/model/contract: format 1, cliVersion, reading, comparisonReading (null when the state compares nothing), check (VaultCheckSchema), icons (name to path data).
2. Add policyIconPaths to @archboard/renderer/bun, from the icon naming rule that the browser already uses, moved to shared/render/rules/policy-icons.ts so the browser and Bun share it.
3. Add archboard model snapshot (apps/cli/src/cli/commands/model/operations/snapshot.ts): the selectors of model read (--state, --against, --model, --flow) taken from its contract, --out required. Read the selected state, then its comparison state the way the canvas reads it, then the vault check of the selected state; validate with the schema; write compact JSON as a file receipt.
4. Keep both package interfaces at their width ceilings (ADR 0058): drop the derivable type export ArchitectureCheckpointRequest from the model contract, and replace RASTER_MIN_SCALE and RASTER_MAX_SCALE with one RasterScaleSchema that the rasterize command used to assemble.
5. Add the cli-command-audit.json entry, update boundaries.md, and document the new parts in this repository's model so check:model passes.
6. System test tests/system/models/model-snapshot.test.ts: a draft and its comparison, same bytes twice, parse with the exported schema, no comparison for current, a refused read writes no file.

PR #87 review: preserve the exact checkpoint when selecting snapshot diagnostics. Add one regression to the existing system owner, then run the affected CLI, model, and contract lanes. The Model snapshot module vKEsyHFk#V390L948 and its check relationship vKEsyHFk#NfuvWVgE stay accurate. This correction changes no architecture, so no proposal is needed.

Boundary review of PRs #87 and #86: describe the icon map as the union of the check, selected-reading, and comparison-reading policies. Keep one shared naming rule and the existing Remix lookup. Correct the snapshot contract guidance and the Model snapshot and Model snapshot contract modules (vKEsyHFk#V390L948 and vKEsyHFk#50jWlhsK). These edits document implemented code, so no proposal is needed. Run the snapshot and icon owners, the sub-path browser owner, and architecture checks. The browser consumer of the snapshot remains outside these two task scopes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- The file format is ModelSnapshotSchema in @archboard/model/contract: format (1), cliVersion, reading, comparisonReading (null when the state compares nothing), check (the vault check) and icons (icon name to its path data). The type is derived with z.infer by each reader, so no type is exported.
- The comparison state is read the way the canvas reads it (use-model-comparison.ts): by its checkpoint, or by its state, with no comparison of its own. --flow applies only to the selected state, because the flow may not exist in the comparison state. --model applies to both reads.
- The vault check is the check of the selected state (/api/vault/check?state=<id>), so its diagnostics belong to the state the file holds.
- The icons are every icon a picture under the check's policy can name: the policy's, the default vocabulary's and the renderer's own, the same set the browser fetches. The rule moved from the browser host to packages/renderer/src/shared/render/rules/policy-icons.ts so the Bun host shares it.
- configurationFile is written relative to the vault, so the file names no path of the machine that wrote it and a copy of the vault writes the same bytes. Compact JSON with a final newline.
- The command loads @archboard/renderer/bun with a dynamic import in its handler, so the icon set does not load with the command table on every CLI start.
- Interface width (ADR 0058): model and renderer were at their ceilings. Model: dropped the type export ArchitectureCheckpointRequest, which its one caller now derives from ArchitectureCheckpointRequestSchema. Renderer: RasterScaleSchema replaces RASTER_MIN_SCALE and RASTER_MAX_SCALE, which model rasterize put together into the same schema. No ceiling changed.
- This repository's model documents the change on Current (it documents implemented architecture, so no proposal): new parts Policy icons, Icon loading, Model snapshot and Model snapshot contract, and their relationships. check:model passes with no findings.

Evidence:
- AC1, AC3, AC4, AC5, AC7: tests/system/models/model-snapshot.test.ts, test 'a snapshot holds a draft, its comparison state, the vault check and the policy's icons' (writes the snapshot of a fixture draft twice, compares bytes, parses it with ModelSnapshotSchema from @archboard/model/contract, checks cliVersion against archboard --version, the comparison reading's revision and the icon of every node kind), and test 'a state that compares nothing has no comparison reading, and a refused read writes no file'.
- AC2: the parameters are the --state, --against, --model and --flow parameters of the model read contract (snapshot.ts filters them by the selection schema); archboard model snapshot --help lists them, and the system test selects with --state.
- AC6: docs/design/cli-command-audit.json has the 'model snapshot' entry; tests/system/cli/command-contract-artifacts.test.ts renders one table row per entry and passed.
Lanes: check:first 19/19 (lint, format, types, core, repository 170 pass); check:model passes with no findings; test:modules 5029 pass, 1 skip, 0 fail; test:system 281 pass, 1 fail (codex-realtime.test.ts timed out at load average 47 and passed 4/4 alone; it does not touch this change); test:solo 15 pass; browser owner browser-drawn-pictures.test.ts passes. The full test:serial-browser lane was not run.

PR #87 review found one P2 error in snapshot diagnostics. The command now checks the exact retained checkpoint before it falls back to a state ID. The existing system fixture proves that a changed live relationship does not alter diagnostics for its retained baseline. That regression failed before correction (3 pass, 1 fail) and passes after correction. Final focused snapshot, comparison-refusal and runner tests: 28 pass, 0 fail. Artifact, interface-width, CLI audit and configuration-route tests: 15 pass, 0 fail. Final types, lint:policy, lint:tests, format:check and check:model pass. The architecture check reports existing evidence skips for 84 exposure-unknown subjects, 9 unbound subjects and 1 text-only checkout. The first combined test invocation without --parallel failed four isolation-sensitive tests. The documented parallel invocation passes. Initial complexity and formatting failures are resolved without rule changes. A test helper deleted this clean checkout vault during an architecture read attempt. The reviewer restored its tracked bytes from HEAD; git diff confirms no vault change. The model remains accurate, so no architecture proposal or model edit is needed. Standards found no verified rule violations. Retained policy icons, comparison coherence and atomic artifact writes remain correct. No push or changes to PR #86.

Boundary review with PR #86: verified one iconsNamedBy rule shared by snapshot serialization and the browser loader, with the same iconPaths lookup behind the HTTP route. All three policies contribute snapshot icons, including retained comparison icons. Corrected the schema guidance, boundaries.md, and the Model snapshot and Model snapshot contract modules to state that contract. No runtime correction was needed in this PR, and it requires no code from #86. Focused snapshot and icon owners: 6 pass, 0 fail. check:model and format:check pass. Architecture evidence retains 84 exposure-unknown subjects, 9 unbound subjects, and 1 text-only checkout as skips. The browser still does not consume a snapshot file or its icon map. The server-free reader goal remains incomplete across the pair.

Cross-branch contract probe: all 18 icon entries from a snapshot written by PR #87 match the JSON paths served through the browser icon route under /project/ from PR #86. No names or paths differ.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard model snapshot --out <file> writes one portable, server-free reading of a model: the reading of the state that --state, --against, --model and --flow select, the reading of its comparison state (null when it compares nothing), the vault check of that state, and the path data of every icon a picture under its policy can name, with a format version (1) and the CLI version. ModelSnapshotSchema in @archboard/model/contract describes the file; policyIconPaths in @archboard/renderer/bun gives the icons from the naming rule the browser already used, now in shared/render/rules/policy-icons.ts. An unchanged vault writes the same bytes, and the configuration file is written relative to the vault so the file names no local path. Both package interfaces stay at their width ceilings: the model contract no longer exports the derivable ArchitectureCheckpointRequest type, and RasterScaleSchema replaces the two raster scale constants. The CLI audit, boundaries.md and this repository's model describe the change. Open: the full serial browser lane was not run.

Boundary review corrected the documentation of the three policy sources and the remaining consumer gap. Snapshot and icon tests pass 6/6. Architecture and formatting pass. PR #87 remains independent of the base-path change.
<!-- SECTION:FINAL_SUMMARY:END -->
