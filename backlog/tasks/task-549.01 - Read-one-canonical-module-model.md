---
id: TASK-549.01
title: Read one canonical module model
status: Done
assignee:
  - '@codex'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T07:43:00Z'
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
- [x] #4 The returned revision covers discovered paths and exact bytes. The browser lists root modules and opens their authored details.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Deliver one strict canonical model read through the shared runtime, with stable identities, metadata preservation, and exact input revisions.
2. Expose that same read through the CLI and server, with explicit vault addressing and structured refusals.
3. Add the browser root list and authored details through the existing pane and shared query cache. Keep content read-only and selection local.
4. Prove the workflow through the approved runtime and browser seams. Include invalid input, repair, empty content, unchanged persisted inputs, and legacy pane regression coverage.
5. Update the decision, consumer guidance, and affected architecture. Adopt the four TASK-549.01 proposals after validation and correct their overview grouping.
6. Commit with signing, merge the latest integration tip, and hand the completed ticket branch to the merger agent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The branch contains integration c95d47ea6 before implementation. Locked dependencies installed without lock changes. Affected architecture proposals exist before code changes. The public architecture read/write seam with real temporary files and Git repositories is already approved. No frontend, storage write, archive, migration, or proposal-patch implementation belongs in this handoff.

Backend handoff: readArchitectureModel(vault, module?) is exported from @archboard/board/store-read. ArchitectureModelRead and ArchitectureModelReadSchema are exported from @archboard/board/model. GET /api/architecture/model requires vault and accepts an optional module selector. archboard model read [module] uses the same runtime result and returns exit 2 with structured JSON on model refusal. CLI envelopes also carry the existing vault field.
The authored fixture is examples/canonical-model/.archboard/vault. Copy it into a temporary holder before using -C, because this checkout retains its legacy vault authority. Qualified identities use model[/original-board]#local-id, derived from the existing short ID authority. Names resolve only once, exact identities take precedence, and file renames preserve identity. Roots and outgoing relationships follow authored order with identity tie breakers.
Focused runtime and real HTTP/CLI tests cover metadata, source ownership, unique names, duplicate definitions, containment cycles, missing local targets, strict versions and files, policy errors, retired identities, dependency cycles, empty architecture, and exact path/byte revisions. The reader captures inputs twice and refuses changing sets. It never writes architecture inputs.
Verification: 603 package and command-contract regression tests pass. Four surface owners pass 14 tests, including existing tracked embeds and render recipes. The focused canonical owners pass 13 tests. Type checking, full lint, formatting, and deterministic skill evaluation input checks pass. No model evaluations ran. Architecture semantic checks pass. The affected draft proposals have no code-check warnings after their inherited stale evidence is repaired. The full vault code check exits 1 for 12 existing warnings on other boards; see the handoff evidence.
AC 4 remains unchecked because the browser root listing and authored details belong to the parent. The browser consumes roots as qualified IDs, finds details in modules, and uses selectedModule for a requested module. Incoming relationships derive from relationships filtered by to. Keep the task In Progress and all three TASK-549.01 proposals as drafts until the parent completes the browser criterion. This is only the backend implementation handoff.

The browser portion is complete. The real-browser regression first failed because no canonical model surface existed. It now passes for root ordering, authored details, a connected pane, unchanged architecture revision, invalid input recovery, and an empty model.

Validation: three browser cases pass, including legacy board rendering and traffic. Seven isolated UI owners pass all 32 tests. Package API and dependency contracts pass all 72 tests. Source and frontend type checks, full lint, formatting, and git diff --check pass. Light and dark captures were inspected locally and remain outside the repository.

The initial combined Bun command shared incompatible DOM lifecycles between test files. The same owners pass in separate processes, as the UI test contract requires.

The final simplification moves the shared pane header frame into the UI kit. Both model and legacy panes use it. The canonical query also participates in the existing refresh and reconnect invalidation.

Board persistence, Command interface, Archboard server routes, and Browser application now adopt TASK-549.01. The semantic check has no diagnostics. Their code checks have no warnings. The complete vault code check still reports 12 existing warnings on other boards. The frontend build retains its existing large-chunk warning.

Evidence and handoff files are under /home/msc/.local/state/archboard-implementation/task-549. No push or PR occurred in this ticket checkout. The integration merger and PR review remain parent work.

Pre-push review: the independent backend review found no Standards or Spec issues through integration 66981b2ca. The parent reviewed the browser scope and fixed one Spec issue: generic middleware refusals lost their code and recovery message. The shared request client now preserves those refusals. The existing browser owner proves that a missing vault reports VAULT_UNREADABLE and reopens after restoration. The regression failed with READ_FAILED before the fix. All three browser cases and 73 request-client and code-opener tests pass. Final lint and both type checks pass. No architecture description changes are needed because the existing Server requests responsibility already owns consistent refusal handling. Review evidence remains under /home/msc/.local/state/archboard-implementation/task-549.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented one canonical model read across the runtime, CLI, server, and browser. Root modules open their authored details without writing architecture or creating boards. Stable identities, strict diagnostics, exact input revisions, recovery, and legacy behavior pass focused tests. The affected architecture and consumer guidance match this delivery. Canonical writes, history, and recursive diagram navigation remain assigned to later TASK-549 tickets.
<!-- SECTION:FINAL_SUMMARY:END -->
