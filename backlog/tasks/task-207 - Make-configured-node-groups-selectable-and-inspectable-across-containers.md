---
id: TASK-207
title: Make configured node groups selectable and inspectable across containers
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 22:37'
updated_date: '2026-09-14 02:55'
labels: []
dependencies: []
references:
  - src/shared/semantic-policy/index.ts
  - src/shared/semantic-board/index.ts
  - src/shared/semantic-board/lib/compare.ts
  - src/shared/semantic-board/lib/reconcile.ts
  - src/shared/semantic-board/lib/scope.ts
  - src/runtime/semantic-board-store/lib/vocabulary.ts
  - src/cli/commands/semantic.ts
  - src/ui/semantic-board-canvas/components/SemanticBoardStage.tsx
  - src/ui/semantic-board-canvas/components/SemanticInspectorParts.tsx
documentation:
  - CONTEXT.md
  - docs/adr/0024-vault-configuration-owns-vocabulary-and-presentation.md
  - docs/adr/0025-containment-and-type-own-distinct-visual-channels.md
  - docs/adr/0026-vault-diagnostics-drive-cli-and-agent-repair.md
  - docs/agents/frontend.md
  - docs/agents/test-suite.md
type: feature
ordinal: 366000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers need to identify the parts involved in a concern and its dependencies across structural containers. The current optional free-text node.group is shown only in the inspector, permits one membership, and has no renderer effect. It adds authoring and reconciliation cost without helping that workflow.

Agreed model: vault configuration defines groups as a record keyed by stable readable IDs, for example groups: { fulfillment: { name: "Fulfillment" }, billing: { name: "Billing" } }. Nodes reference an unordered set serialized as groups: ["fulfillment", "billing"]. Renaming a display name does not change board meaning. Membership is explicit and independent of parent and kind.

Deliver this as one coherent feature: configuration and set membership earn their place through selectable group emphasis and equivalent CLI inspection. Example: a handler, queue, worker and datastore belong to Fulfillment across multiple containers; a shared worker also belongs to Billing.

Scope excludes group colors, styling options, group containers, inherited membership, arbitrary tag metadata, a configuration editor, and combined multi-group filtering. Initially inspect one group at a time while nodes may belong to many. Supersedes the single-membership contract in completed TASK-183.02; retain existing containment/type color policy and browser-as-viewer ownership. This request is planning only; implementation has not started.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vault configuration accepts groups keyed by readable IDs with display names and an empty default; semantic config, its schema, and vault diagnostics expose the vocabulary. Display-name changes refresh readers without modifying board content or comparison results.
- [x] #2 Node groups are optional explicit memberships serialized as a unique, deterministically ordered array. Omitted and empty memberships mean the same thing; duplicates cannot persist; reordering alone creates no semantic change. No membership is inherited from parent.
- [x] #3 Authoring, persistence, comparison, propagation, reconciliation, settlement and adoption use the new groups contract. Three-way reconciliation merges each group membership independently, preserving unrelated concurrent additions/removals and existing node deletion conflict rules.
- [x] #4 Group-reference validation follows ADR 0026: valid configuration refuses newly authored unknown IDs; removed definitions remain readable by ID with actionable diagnostics; missing/invalid configuration uses the existing warning/fallback and recovery behavior.
- [x] #5 A discoverable board-level group selector lists groups used in the active variant, including unresolved IDs, and inspector memberships are selectable. A visible active-group state and keyboard-accessible clear action let readers enter and leave one-group inspection; boards with no memberships have a clear empty state.
- [x] #6 Selecting a group emphasizes its explicit members and edges between members, keeps immediate external neighbors and boundary-crossing edges readable, and subdues unrelated content. Structural ancestors provide context without becoming members. Layout, camera, containment, type colors and comparison indicators remain intact.
- [x] #7 Inspection reports members, internal edges, boundary edges with direction, and immediate external neighbors for an explicit board and variant. CLI and browser use the same semantic result, with deterministic output and no browser prerequisite for CLI use. Unknown requested IDs and configured groups with zero members have distinct, actionable outcomes.
- [x] #8 Hidden or collapsed members remain included in inspection and are identified as hidden; visible ancestor context is distinguished from actual membership. Group emphasis does not claim a collapsed ancestor is a member or silently expand/rearrange it.
- [x] #9 Active group inspection remains pane-local, refreshes on board/configuration changes, clears on board or variant navigation, and remains recoverable when its last member or definition disappears. It has an explicit non-conflicting interaction with existing subject selection and walkthrough emphasis; browser interactions write no board content.
- [x] #10 The legacy singular group path is removed from production contracts and authored documentation/examples. Existing-data handling is explicit: inventory actual persisted uses and schema versions, document and perform any required one-time conversion without silent loss or slug collisions, and do not retain a parallel legacy authoring API.
- [x] #11 Documentation covers configuration, multiple memberships, discovery, selection, CLI inspection and recovery. Focused runtime and browser checks prove the workflow on a board with overlapping memberships across containers; bun run check passes without weakened rules or file-content tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory: tracked .archboard vault holds no persisted node.group (schemaVersion 2.1.0 files, code constant 2.0.0). No data conversion is required; bump SEMANTIC_BOARD_SCHEMA_VERSION to 2.2.0 (node.groups replaces node.group) and make a legacy singular group in a file an actionable read refusal naming the node and the one-time hand conversion, never a silent rewrite.
2. Policy: add groups: record<VocabularyName, { name }> with an empty default to src/shared/semantic-policy; DEFAULT_SEMANTIC_POLICY gains groups: {}; the config schema/JSON schema and VaultCheck carry it.
3. Board contract: replace GroupLabelSchema/node.group with node.groups (array of configured ids, refined unique and sorted; omitted when empty). Input accepts any order/duplicates; the write boundary normalizes (dedupe, sort, omit empty). Comparison treats groups as a set with omitted == empty. Add pure inspectGroup/groupsUsed in src/shared/semantic-board/lib/groups.ts exported from index.
4. Reconciliation: merge each membership as its own boolean against the base (inherit, keep, agree); no competing-field can arise for one membership; keep deleted-and-changed. Rewrite grouping tests accordingly.
5. Store: vocabulary references gain node:<id>:groups:<gid> keyed by stable ids for diagnostics and newVocabularyProblem; edit-content normalizes memberships; read refuses legacy group with an actionable message.
6. CLI: semantic inspect <name> --group <id> [--variant <v>] in src/cli/commands/semantic-inspect.ts (server read, no browser), registered in run.ts and the authored audit JSON. Unknown id (no definition, no membership) refused; configured-empty returns empty success; unresolved but used ids inspect with a warning.
7. Renderer: stylesheet gains the group emphasis classes a viewer toggles (member, boundary, context, and the surface-level focus that subdues the rest); nothing else changes.
8. UI: vault-check query moves to semantic-board-canvas/lib/queries.ts (vault-diagnostics reuses it); lib/groups.ts derives groups used, inspection, names and emphasis from the document + policy + atlas; hooks/use-group-focus.ts keeps pane-local active group keyed by board + resolved variant; components/SemanticGroupBar.tsx (selector, active state, clear, empty state) sits in the reading strip; SemanticDiagram toggles emphasis classes; inspector memberships are selectable; group choice exits walkthrough and vice versa.
9. Tests: shared groups/compare/reconcile unit tests; store grouping tests rewritten; CLI product check in tests/system/semantic-boards; rendered stage tests for selector/clear/emphasis/hidden/reset; browser owner for keyboard + computed emphasis.
10. Docs: CONTEXT.md Group term, ADR 0025 wording, INSTALL.md config example, SKILL.md + reference examples on groups arrays, sync skills; bun run check.

Review fix: discard pane-local group choice when the board or resolved variant changes, and extend the rendered navigation owner with a round-trip assertion so returning cannot resurrect a cleared inspection.

Review fix: expose the existing shared group inspection in a compact disclosure beside the selector, listing explicit members with hidden status, internal edges, directed boundary edges and immediate neighbors; cover the hidden-member and relationship report in the rendered UI owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: policy groups record (empty default); node.groups canonical set (unique, sorted, omitted when empty) with input normalization at the write boundary; set comparison; per-membership reconciliation; stable-id vocabulary references and refusals; schema 2.2.0 with an actionable legacy-group read refusal; semantic inspect CLI (audit JSON updated); renderer stylesheet group classes; UI group bar in the reading strip, pane-local focus hook, inspector memberships, emphasis marks; vault-check query moved to semantic-board-canvas. Docs: CONTEXT.md, ADR 0025, INSTALL.md, skill + reference + evals, skills synced. Tests: shared groups/compare/reconcile, store grouping (rewritten), CLI product owner, 10 rendered stage cases, browser owner registered in the lane.

Validation: bun run check passed end to end (lint, fmt, both type checks, modules, system, repository, serial browser lane) on 2026-09-14 with the new owners included: src/shared/semantic-board/tests/groups.test.ts, src/runtime/semantic-board-store/tests/grouping.test.ts (rewritten), tests/system/semantic-boards/groups.test.ts, src/ui/semantic-board-canvas/tests/semantic-board-groups.test.tsx (10 cases), tests/system/browser/semantic-board-groups.test.ts (registered in BROWSER_TEST_PATHS and package.json). Inventory: no persisted singular group in the tracked vault; schema bumped to 2.2.0; a legacy file is refused with the hand conversion named (no silent rewrite). Design choice: the group control shows a disabled 'No groups' empty state in the reading strip, so the narrative test's 'no strip' assertion now asserts the disabled group control instead.

Review repairs: the rendered round-trip navigation assertion reproduced restored group focus (expected empty, received fulfillment); useGroupInspection now discards the prior choice when navigation leaves its board or resolved variant. Added a compact Details disclosure over the diagram containing members with hidden identities, internal relationships, directed incoming/outgoing boundary relationships and immediate neighbors from the same shared inspection. Focused validation passed: 11 rendered group cases / 53 assertions, type-aware lint for all changed UI files, frontend build, and the serial browser group owner (1 case / 15 assertions, keyboard disclosure and no board writes). Full check remains coordinated by the parent review task.

Review integration gate: bun run check passed after all fixes, including both TypeScript projects and the full serial browser lane. Fixed permanent group-focus reset on navigation and complete browser inspection details including hidden member identities and directed boundary relationships.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced node.group with configured multi-membership groups: vault policy groups record (empty default), node.groups as a canonical unique sorted set normalized at the write boundary, set comparison, per-membership reconciliation without competing-field conflicts, stable-id vocabulary diagnostics and refusals under ADR 0026, schema 2.2.0 with an actionable legacy refusal, a pure inspectGroup shared by the CLI (semantic inspect <name> --group <id> [--variant]) and the browser (reading-strip selector, status, clear, inspector memberships, member/boundary/context emphasis, hidden-member accounting, pane-local reset on board/variant change, walkthrough exclusivity). Docs, skill, evals and audit updated; skills synced. Verified with the new shared, store, CLI product, rendered and real-browser owners and a passing bun run check.

Review fixes verified by the complete normal gate: navigation no longer restores stale focus, and browser Details exposes the same semantic membership and relationship inspection as the CLI.
<!-- SECTION:FINAL_SUMMARY:END -->
