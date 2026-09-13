---
id: TASK-207
title: Make configured node groups selectable and inspectable across containers
status: To Do
assignee: []
created_date: '2026-09-13 22:37'
updated_date: '2026-09-13 23:33'
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
- [ ] #1 Vault configuration accepts groups keyed by readable IDs with display names and an empty default; semantic config, its schema, and vault diagnostics expose the vocabulary. Display-name changes refresh readers without modifying board content or comparison results.
- [ ] #2 Node groups are optional explicit memberships serialized as a unique, deterministically ordered array. Omitted and empty memberships mean the same thing; duplicates cannot persist; reordering alone creates no semantic change. No membership is inherited from parent.
- [ ] #3 Authoring, persistence, comparison, propagation, reconciliation, settlement and adoption use the new groups contract. Three-way reconciliation merges each group membership independently, preserving unrelated concurrent additions/removals and existing node deletion conflict rules.
- [ ] #4 Group-reference validation follows ADR 0026: valid configuration refuses newly authored unknown IDs; removed definitions remain readable by ID with actionable diagnostics; missing/invalid configuration uses the existing warning/fallback and recovery behavior.
- [ ] #5 A discoverable board-level group selector lists groups used in the active variant, including unresolved IDs, and inspector memberships are selectable. A visible active-group state and keyboard-accessible clear action let readers enter and leave one-group inspection; boards with no memberships have a clear empty state.
- [ ] #6 Selecting a group emphasizes its explicit members and edges between members, keeps immediate external neighbors and boundary-crossing edges readable, and subdues unrelated content. Structural ancestors provide context without becoming members. Layout, camera, containment, type colors and comparison indicators remain intact.
- [ ] #7 Inspection reports members, internal edges, boundary edges with direction, and immediate external neighbors for an explicit board and variant. CLI and browser use the same semantic result, with deterministic output and no browser prerequisite for CLI use. Unknown requested IDs and configured groups with zero members have distinct, actionable outcomes.
- [ ] #8 Hidden or collapsed members remain included in inspection and are identified as hidden; visible ancestor context is distinguished from actual membership. Group emphasis does not claim a collapsed ancestor is a member or silently expand/rearrange it.
- [ ] #9 Active group inspection remains pane-local, refreshes on board/configuration changes, clears on board or variant navigation, and remains recoverable when its last member or definition disappears. It has an explicit non-conflicting interaction with existing subject selection and walkthrough emphasis; browser interactions write no board content.
- [ ] #10 The legacy singular group path is removed from production contracts and authored documentation/examples. Existing-data handling is explicit: inventory actual persisted uses and schema versions, document and perform any required one-time conversion without silent loss or slug collisions, and do not retain a parallel legacy authoring API.
- [ ] #11 Documentation covers configuration, multiple memberships, discovery, selection, CLI inspection and recovery. Focused runtime and browser checks prove the workflow on a board with overlapping memberships across containers; bun run check passes without weakened rules or file-content tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution ordering: TASK-207 and TASK-208 are the first implementation stage and may proceed in parallel with coordinated edits to semantic command contracts/help. BOTH must be Done before TASK-209, TASK-210 or TASK-211 begins. This is a plan only; retain To Do until implementation is actually authorized and starts.

1. Reconfirm the contract against CONTEXT.md, ADRs 0023–0026 and docs/agents/frontend.md. Inventory legacy node.group in actual configured vaults, fixtures and complete family snapshots, recording schema versions. The planning scan found no singular group properties in tracked .archboard JSON and schemaVersion 2.1.0 there; that does not establish external vault compatibility. Choose an explicit one-time conversion only where actual data requires it, including reconciliation bases/issue values, with a reviewed label-to-stable-ID mapping that prevents slug collisions or dropped membership. Decide/document the schema-version treatment; use the store's atomic write boundary with stopped/owned access as appropriate, no silent read-time writes and no parallel legacy authoring API.
2. Add groups: record<readable ID, { name }> with an empty default to src/shared/semantic-policy/index.ts, reusing VocabularyNameSchema. Replace GroupLabelSchema/node.group across semantic-board primitives/input/content/exports with optional explicit groups memberships. Normalize unique IDs into deterministic order and canonical empty equivalence; compare as a set. Display-name changes live entirely in policy and must not rewrite board content or create semantic changes; membership is independent of parent and kind.
3. Carry membership through src/runtime/semantic-board-store/lib/edit-content.ts and all comparison, propagation, reconciliation, settlement and adoption paths. In semantic-board/lib/reconcile.ts merge each ID's boolean membership against the base, preserving independent concurrent additions/removals. There is no competing-field disagreement for the same boolean membership from one base: both changed sides necessarily agree. Avoid inventing per-membership settlement machinery; retain existing node-deleted-versus-membership-changed conflicts. Remove the scalar group conflict path and rewrite its obsolete tests.
4. Extend store/lib/vocabulary.ts, configuration.ts and diagnostics.ts with stable node-ID/group-ID references, not array-position identities. Preserve ADR 0026 and newVocabularyProblem behavior: valid config refuses newly authored unknown IDs, retained removed definitions remain readable/diagnosable (including reconciliation bases and branches), and missing/invalid config uses existing fallback/recovery. Include group vocabulary in semantic config/schema output and config fingerprint refresh.
5. Add one pure semantic inspection operation under src/shared/semantic-board, exported through its public interface, over full resolved variant content before view projection. Return deterministic explicit members, internal edges, incoming/outgoing boundary edges and deduplicated immediate external neighbors; keep display-name resolution separate from semantic membership. Propose semantic inspect <name> --group <id> [--variant <v>] through the existing CLI contract and read boundary, confirming spelling with TASK-208. Configured-empty groups return an empty success; unknown IDs with no definition/membership get an actionable refusal; unresolved IDs still used by nodes remain inspectable. CLI needs no browser, and browser consumes the same result contract.
6. Compose a focused group selector/hook into SemanticBoardStage.tsx and selectable memberships into SemanticInspectorParts.tsx. Reuse the existing reading strip, board-document queries in use-variant-reading.ts/lib/queries.ts and policy refresh in ui/vault-diagnostics; keep only active group ID as pane intent, scoped to the actual drilled board and resolved variant identity. List groups used by the active variant, including unresolved IDs, and provide active state, an accessible clear action and a membership-free empty state. Refresh after board/config changes without a second board-content cache; clear on board/variant navigation including drill/back, preserve through view changes, and show recoverable state if the last member/definition disappears.
7. Derive emphasis from the shared inspection result plus rendered subject mapping: explicit members/internal edges stand out, immediate neighbors and directed boundary edges remain readable, unrelated subjects recede, and ancestors provide context without becoming members. Include hidden or collapsed members in inspection with visibility status; never expand/rearrange them. Preserve layout/camera/type colors/containment/comparison indicators. Do not fake a walkthrough beat: existing BeatFocus couples attention with camera movement, so separate any shared emphasis primitive from walkthrough targeting. Choosing a group exits walkthrough emphasis; entering a walkthrough clears group focus; ordinary subject selection can coexist.
8. Use the cheapest credible existing owners: semantic/store grouping and policy tests for normalization, membership merges, deletion conflicts, propagation/adoption and configuration recovery; pure inspection tests for cross-container overlap/direction/empty-versus-unknown; one zero-browser CLI product check for the read contract. Focused rendered canvas coverage owns selector/clear, live refresh, hidden versus ancestor context, two-pane independence, drill/variant reset and walkthrough interaction. Use real-browser coverage for keyboard and visual behavior that needs that boundary, through the prescribed adapter. Do not add content-matching tests or an exhaustive visual combination matrix.
9. Update CONTEXT.md and affected ADR wording, INSTALL.md, CLI contract/help and minimal canonical skill examples to document configuration, multi-membership, discovery, inspection and recovery; remove authored legacy examples and sync derived skills. Keep TASK-211's broad rewrite separate. Demonstrate the Fulfillment/Billing cross-container workflow, run bun run check, and simplify state/abstractions after implementation. Handoff the final groups, inspection, schema and browser-evidence contracts to TASK-209/210/211 before those tasks start.
<!-- SECTION:PLAN:END -->
