---
id: TASK-087
title: Pin and test the Obsidian plugin format Archboard depends on
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-21 12:18'
updated_date: '2026-08-28 01:04'
labels: []
dependencies: []
references:
  - docs/design/vendor/README.md
  - docs/design/vendor/ExcalidrawData.ts
  - docs/adr/0017-a-note-keeps-its-own-record-of-where-its-images-went.md
  - scripts/check-obsidian-md.mjs
priority: medium
type: task
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard's Obsidian note contract relies on behavior in the Obsidian Excalidraw plugin's ExcalidrawData.ts. The reading copy was previously saved without a pinned upstream identity. This task records the exact repository, commit, manifest version, source path, and the pinned methods and regions that support the format claims in ADR 0017.

The existing scripts/check-obsidian-md.mjs examples are Archboard-authored and synthetic. They protect Archboard's parser and round-trip behavior, but they do not detect drift in real plugin-emitted bytes.

No exact plugin-authored .excalidraw.md note from plugin version 2.26.4 was found in the pinned upstream tree or the available local material. This task therefore does not add or adopt a fixture and does not claim real-plugin byte coverage. It does not copy the v2.19 issue attachment, manufacture provenance, automate Obsidian, or build a plugin runner. The implementation is docs-only unless a very small explanatory code comment is required to keep the documented boundary accurate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/design/vendor/README.md records the exact upstream repository, commit 36a32940bac50fd60fb379b18a9f38668f941108, manifest version 2.26.4, and source path src/shared/ExcalidrawData.ts, with links to the pinned source and ADR 0017.
- [ ] #2 The vendor README and ADR 0017 name the pinned upstream methods or source regions for every plugin behavior Archboard relies on, including Embedded Files parsing, generation of the complete Drawing payload, file syncing, scene.files clearing, and the bidirectional Element Links lifecycle: loadData applies persisted links, findNewElementLinksInScene adds only missing links, syncElements/updateElementLinksFromScene reconcile links during sync and save, and generateMDBase emits the map.
- [ ] #3 The documentation states that scripts/check-obsidian-md.mjs uses Archboard-authored/synthetic examples that protect Archboard's parser and round-trip behavior but do not detect drift in real plugin-emitted bytes.
- [ ] #4 The documentation states that no exact plugin-authored note from version 2.26.4 was found and that this task adds no fixture, v2.19 issue attachment, Obsidian automation, plugin runner, or second format implementation. TASK-087 remains In Progress with these criteria unchecked for independent review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update docs/design/vendor/README.md with the pinned repository URL, commit 36a32940bac50fd60fb379b18a9f38668f941108, manifest version 2.26.4, source path src/shared/ExcalidrawData.ts, pinned source links, and the reading-copy boundary. Map each relied-on behavior to the upstream method or region.

2. Update ADR 0017 to link the provenance record and identify the upstream methods and complete source regions supporting its claims: loadData for Embedded Files input and persisted Element Links application, generateMDBase for Embedded Files and scene JSON construction through its return at lines 1379-1467, generateMDAsync and generateMDSync for Drawing-section construction and emission at lines 1470-1495, syncFiles and syncElements for vault persistence and clearing scene.files, and findNewElementLinksInScene/updateElementLinksFromScene for the bidirectional Element Links lifecycle during sync and save.

3. State the evidence limit plainly. The pinned upstream tree and available local material contain no exact 2.26.4 plugin-authored note. The current check-obsidian-md cases are Archboard-authored/synthetic and do not detect drift in real plugin-emitted bytes. Do not copy the v2.19 issue attachment, add a fixture, automate Obsidian, build a plugin runner, or implement another parser.

4. Do not change scripts/check-obsidian-md.mjs unless a very small explanatory comment is necessary to keep that boundary explicit. No fixture or other code change is expected.

5. Validate the docs-only change with bun run test:obsidian, the applicable formatting check, and git diff --check. Keep TASK-087 In Progress and all acceptance criteria unchecked for independent review. Commit only the approved README, ADR, and Backlog task changes, with no push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved docs-only contract. Pinned the upstream repository, commit, manifest version, source path, and method regions in the vendor README and ADR 0017. Documented that no exact v2.26.4 plugin-authored note was found, that the v2.19.0 issue attachment is not used, and that check-obsidian-md remains Archboard-authored/synthetic coverage. No fixture, script change, Obsidian automation, plugin runner, or second parser was added.

Validation: bun run test:obsidian passed 197 checks; bun run fmt:check passed; git diff --check passed. Acceptance criteria remain unchecked and TASK-087 remains In Progress.

Applied the independent-review corrections. Extended the Drawing provenance through generateMDBase's return and through generateMDAsync/generateMDSync lines 1470-1495. Corrected the Element Links description to cover load-time application, missing-link discovery, sync/save reconciliation, and current-map emission. No fixture or script/runtime change was added.

Validation: bun install --frozen-lockfile passed with no changes; bun run test:obsidian passed 197 checks; bun run fmt:check passed; git diff --check passed. Acceptance criteria remain unchecked and TASK-087 remains In Progress.
<!-- SECTION:NOTES:END -->
