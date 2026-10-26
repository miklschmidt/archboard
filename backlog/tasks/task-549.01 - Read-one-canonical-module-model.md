---
id: TASK-549.01
title: Read one canonical module model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T05:46:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 1.

## What to build

Overlapping board documents prevent readers from inspecting one consistent repository model.

Deliver a coherent read of an authored model vault through the public runtime, CLI, and server. Readers can inspect its root modules and relationships.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

None. This ticket can start immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deliver a coherent read of an authored model vault through the public runtime, CLI, and server. Readers can inspect its root modules and relationships.
- [x] #2 Include the manifest, qualified identities, module definitions, source-owned relationships, policy, and strict file discovery. Preserve ordering, groups, evidence, bindings, and document references.
- [x] #3 Names resolve only when unique. Filename changes preserve identity. Duplicate definitions, invalid containment, unsupported formats, and missing local targets produce structured diagnostics.
- [ ] #4 The returned revision covers discovered paths and exact bytes. The browser lists root modules and opens their authored details.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing board runtime and shared schemas with an explicit, read-only canonical model path. Existing legacy files retain authority.
2. Use red/green slices at the approved public architecture read seam with real temporary files and Git repositories. Cover authored metadata, identity, discovery, strict diagnostics, unique names, and exact path/byte revisions.
3. Expose the same result through GET /api/architecture/model and archboard model read [module], with explicit vault addressing. Leave frontend and browser tests for the parent.
4. Keep Board persistence@TASK-549.01, Command interface@TASK-549.01, and Archboard server routes@TASK-549.01 as drafts. Update relevant ADR and consumer instructions.
5. Run focused behavioral and structural gates, simplify the resulting design, commit with signing, merge the latest integration tip, and rerun affected checks. Record backend evidence without closing the frontend criterion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The branch contains integration c95d47ea6 before implementation. Locked dependencies installed without lock changes. Affected architecture proposals exist before code changes. The public architecture read/write seam with real temporary files and Git repositories is already approved. No frontend, storage write, archive, migration, or proposal-patch implementation belongs in this handoff.

Backend handoff: readArchitectureModel(vault, module?) is exported from @archboard/board/store-read. ArchitectureModelRead and ArchitectureModelReadSchema are exported from @archboard/board/model. GET /api/architecture/model requires vault and accepts an optional module selector. archboard model read [module] uses the same runtime result and returns exit 2 with structured JSON on model refusal. CLI envelopes also carry the existing vault field.
The authored fixture is examples/canonical-model/.archboard/vault. Copy it into a temporary holder before using -C, because this checkout retains its legacy vault authority. Qualified identities use model[/original-board]#local-id, derived from the existing short ID authority. Names resolve only once, exact identities take precedence, and file renames preserve identity. Roots and outgoing relationships follow authored order with identity tie breakers.
Focused runtime and real HTTP/CLI tests cover metadata, source ownership, unique names, duplicate definitions, containment cycles, missing local targets, strict versions and files, policy errors, retired identities, dependency cycles, empty architecture, and exact path/byte revisions. The reader captures inputs twice and refuses changing sets. It never writes architecture inputs.
Verification: 603 package and command-contract regression tests pass. Four surface owners pass 14 tests, including existing tracked embeds and render recipes. The focused canonical owners pass 13 tests. Type checking, full lint, formatting, and deterministic skill evaluation input checks pass. No model evaluations ran. Architecture semantic checks pass. The affected draft proposals have no code-check warnings after their inherited stale evidence is repaired. The full vault code check exits 1 for 12 existing warnings on other boards; see the handoff evidence.
AC 4 remains unchecked because the browser root listing and authored details belong to the parent. The browser consumes roots as qualified IDs, finds details in modules, and uses selectedModule for a requested module. Incoming relationships derive from relationships filtered by to. Keep the task In Progress and all three TASK-549.01 proposals as drafts until the parent completes the browser criterion. This is only the backend implementation handoff.
<!-- SECTION:NOTES:END -->
