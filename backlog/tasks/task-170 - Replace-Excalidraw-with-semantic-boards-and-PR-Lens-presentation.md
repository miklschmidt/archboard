---
id: TASK-170
title: Replace Excalidraw with semantic boards and PR Lens presentation
status: Done
assignee: []
created_date: '2026-09-11 18:08'
updated_date: '2026-09-12 04:52'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-169
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem Statement

Agents currently author Excalidraw geometry and repeatedly produce diagrams with weak visual and typographic hierarchy. The person using Archboard spends time repairing placement, organization, and rendering instead of discussing architecture. Planning also needs chained and competing proposals, deterministic visible change labels, and durable history of which architecture was implemented.

## Solution

Replace drawing primitives as the board's canonical content with a semantic model defined in Zod. Adapt PR Lens inside Archboard for both architecture and message-sequence rendering. The renderer owns geometry, typography, routing, and animation; agents author architecture and presentation intent.

Each board persists one independent variant tree in one versioned JSON document. Named views share a variant's architectural identities. Proposals inherit nonconflicting changes from their predecessor and visibly disclose conflicts; the editing command tells the agent how to resolve affected descendants. Explicit adoption moves a current designation without renaming or erasing architectural states. A read-only viewer supports exploration, code navigation, linked levels, and scroll-driven narrative walkthroughs.

## User Stories

1. As an agent, I want to author nodes and relationships without pixel coordinates, so that diagram quality does not depend on repeated manual layout work.
2. As a person exploring architecture, I want consistent visual and typographic hierarchy, so that responsibilities and important relationships are easy to read.
3. As an agent, I want one Zod contract with inferred types, so that authoring, validation, and rendering agree.
4. As a future schema consumer, I want JSON Schema derived from the same contract when needed, so that no independently maintained schema drifts.
5. As an agent, I want to create an empty named board, so that architecture can be built incrementally.
6. As an agent, I want stable node and edge identities preserved across variants, so that renames and connection changes compare deterministically.
7. As an author, I want names, optional responsibilities, and optional detailed descriptions, so that the viewer can give short and long explanations appropriate treatments.
8. As an author, I want explicit structural containment, so that membership does not need to be inferred from surrounding rectangles.
9. As an explorer, I want separate linked boards at system and service levels, so that I can navigate between services and their internal modules.
10. As an explorer, I want explicit board-and-variant drill-down targets, so that navigation never silently substitutes a different proposal.
11. As an explorer, I want each node to have one optional primary code binding, so that implemented code is accessible and planned components need not invent a location.
12. As an author, I want nodes on one board to reference different repositories, so that a system can span repositories.
13. As an author, I want several named views of one variant, so that different explanations reuse the same nodes.
14. As an explorer, I want to switch or display different views in the frontend, so that I can compare complementary explanations.
15. As an author, I want both PR Lens grammars, so that architecture and ordered message sequences are available.
16. As a presenter, I want agent-authored narrative steps beside the diagram, so that I can explain architecture to leadership.
17. As a presenter, I want scrolling through the narrative to focus the corresponding subjects, so that the diagram follows the explanation.
18. As an explorer, I want pan, zoom, selection, inspection, and code navigation, so that large diagrams remain usable without a drawing editor.
19. As an agent working with a person, I want requests grounded in the selected variant, view, and subjects, so that voice and text refer to the same architecture.
20. As a planner, I want competing proposals and chains of proposals, so that alternatives and incremental designs have explicit ancestry.
21. As a planner, I want each proposal to display its changes relative to its predecessor automatically, so that I need not enter a separate comparison mode.
22. As a planner, I want removed baseline subjects displayed as removed without adding them to proposed content, so that deletion is visible and the proposal remains truthful.
23. As a planner, I want change labels on the entities whose semantic content changed, so that an edge change does not falsely claim both endpoint nodes changed.
24. As a planner, I want rendering changes and narrative edits excluded from architectural node badges, so that visual cleanup does not look like system redesign.
25. As an agent editing a predecessor, I want safe changes to flow into draft descendants, so that proposals remain based on the evolving architecture.
26. As an agent, I want independent field edits and identical changes reconciled automatically, so that only actual incompatibilities require intervention.
27. As an agent, I want conflicting field, deletion, reference, or ordering edits reported explicitly, so that neither parent's nor child's intention is silently discarded.
28. As a person viewing a conflicted proposal, I want its last coherent diagram and visible issues, so that I can inspect it without mistaking it for reconciled content.
29. As the agent that edited a parent, I want affected descendants and repair instructions in that command response, so that I can resolve them without a frontend repair action.
30. As an agent, I want an applied-with-reconciliation-required result distinct from rejection, so that I repair descendants rather than replay an applied parent edit.
31. As a maintainer, I want one atomic write and one version/claim scope for a whole board, so that parent changes and descendant outcomes cannot be partially published.
32. As a planner, I want every architectural state to retain its name while current moves, so that former current architecture remains identifiable.
33. As an operator, I want explicit adoption of any coherent draft, including a competing branch, so that implemented choices can become current without falsifying ancestry.
34. As an operator, I want unresolved proposals refused adoption, so that current never designates conflicted content.
35. As an operator, I want adoption history recorded separately from proposal ancestry, so that I can distinguish proposed evolution from what actually became current.
36. As an operator, I want adopted states to stop inheriting from their predecessor, so that a later proposal edit cannot silently change implemented architecture.
37. As a historian, I want formerly current states frozen against ordinary edits, so that the record of implemented architecture remains trustworthy.
38. As an explorer following a historical board's link, I want the target lifecycle visible, so that independent histories are not presented as an automatic cross-board snapshot.
39. As an author, I want each variant's views and walkthrough to evolve with that variant, so that competing proposals can tell different stories.
40. As a maintainer, I want the adapted PR Lens source and its provenance in this repository, so that schema, renderer, and engine evolve under one verification workflow.
41. As an existing user, I want old board files left untouched, so that replacing the renderer does not destroy my work.
42. As a maintainer, I want obsolete drawing and geometry-inference paths removed after integration, so that the final product has one canonical model.
43. As a user evaluating the replacement, I want this actual feature shown in both grammars with a leadership walkthrough and branching lifecycle, so that acceptance is based on a real workflow.

## Implementation Decisions

- Zod owns the canonical board, command, and result contract; TypeScript types are inferred. Reuse compatible PR Lens definitions and adapt PR-specific provenance, required deltas, flat lanes, and nonempty-graph assumptions. JSON Schema export is derived and deferred until needed.
- One JSON document contains one board's named variant tree, per-variant content, current designation, reconciliation state, and adoption records. Version checks and claims cover that whole board. Separate boards remain independent.
- Use a single board-state write interface, reached by the public commands and dynamic tools, with pure semantic transitions and one existing atomic persistence owner. Preserve visible claims/doing, optimistic versions, atomic replacement, fsync, and publication only after persistence.
- Nodes, edges, variants, views, flows, and ordered steps have stable identities minted by the existing ID owner. Structural parenthood is single-parent and acyclic; diagram geometry is derived.
- Views and optional walkthroughs belong to variant content and share that variant's nodes. Both architecture and message-sequence grammars are delivered. Direct content editing in the viewer is outside scope.
- Derive comparison before view filtering. Compare semantic records by identity, retain before/after facts, and derive removed graphical subjects from the baseline. Never persist agent-authored change labels.
- Only draft proposals inherit parent changes. Reconcile independent fields and equal changes automatically. Incompatible same-field, delete/edit, broken-reference, and conflicting flow/walkthrough ordering changes produce structured issues.
- Persist each variant's coherent content and sufficient prior parent state for deterministic reconciliation and recovery. Internal reconciliation history does not pin the proposal to an obsolete displayed baseline or create a second authoritative present.
- A valid parent change, safe propagation, and conflict records commit atomically. Blocked descendants retain coherent content and identify the blocker. Results distinguish applied, applied with reconciliation required, and rejected; the same agent receives actionable resolution guidance.
- Adoption explicitly designates implemented architecture. It may select any coherent draft, retains ancestry, records the transition, stops inheritance into the adopted variant, and freezes the former current. It is not triggered by approval, rendering, or a merged commit.
- Maintain the PR Lens adaptation in this repository with the originating revision and license. Preserve both grammars and adapt containment, text hierarchy, semantic identity hooks, and measured text. Do not install a separate upstream package as the canonical engine.
- Render SVG plus geometry metadata through the server initially. The existing pane shell owns camera, selection, active view, and walkthrough position as presentation state.
- Build narrative scrolling/highlighting locally: the upstream open-source schema and atlas exist, but the hosted PR Lens viewer is not part of the renderer package.
- Preserve workhorse/coordinator, voice, code-target, navigation, and context-delivery behaviors while replacing their Excalidraw projections.
- Native Obsidian compatibility is dropped. Existing board files are preserved without automatic migration. The final application uses one semantic model; temporary integration compatibility is removed before acceptance.

## Testing Decisions

- The highest main test seam is one public board operation and its observable persisted/result behavior, covering schema validation, version/claim refusal, reconciliation, lifecycle, and recovery. Reuse existing public command and atomic-write test patterns.
- Keep focused pure transition tests for non-obvious field/order reconciliation and identity behavior where process tests would add cost without evidence.
- Use the public rendering result and real pane workflow for visual grammar, hierarchy, selection, navigation, derived labels, conflict disclosure, and walkthrough scrolling.
- Use this feature's existing Excalidraw pipeline and proposed semantic-board pipeline as freshly authored semantic input. Exercise both grammars, views, hierarchy, competing and chained proposals, safe propagation, a conflict surviving restart, agent resolution, adoption, and frozen history.
- Verify that old board files remain untouched; preserving files does not require a second supported editing model.
- Test runtime behavior and external contracts, never source-file contents, lint rules, or repository policy. Avoid duplicate owners and unnecessary broad tests.
- Complete the repository's full check gate and direct application verification. A schema-valid graph alone does not establish readable output.

## Out of Scope

- Free drawing, direct frontend content editing, and frontend conflict-repair actions.
- Legacy-board migration or continued native Obsidian editing.
- A shared cross-board architecture database, automatic cross-board snapshots, or implicit drill-down fallback.
- Multiple ancestry parents, automatic adoption on approval or code merge, automatic inheritance into adopted states, and ordinary historical edits.
- Historical correction machinery until a real need occurs.
- Additional grammars beyond the two inherited from PR Lens.
- Agent-authored coordinates, styling, routing, or change flags.
- Speculative viewport-size limits, automatic partitioning, or fitting every diagram onto one screen.
- A separate renderer release repository or a separately maintained JSON Schema.

## Further Notes

The user completed the design interview and explicitly pre-approved the implementation plan and ticket breakdown, then authorized autonomous orchestration using Claude Opus 5 through the already-running herdr instance. Implementation must follow repository conventions, preserve unrelated work and existing board files, and report concrete verification outcomes. The existing owned Codex service is part of the product; Claude is the implementation worker for this task.

The replacement should leave fewer authoring obligations and fewer canonical representations. Keep the complete path working in small vertical slices, with any temporary coexistence explicitly removed by the final integration ticket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The semantic authoring, two-grammar viewer, narrative, variant reconciliation and adoption workflows satisfy the user stories through public interfaces.
- [x] #2 The real current/proposed pipeline example passes direct application validation and the complete repository check gate.
- [x] #3 The final product has one semantic board model, preserves legacy files, and removes superseded Excalidraw runtime paths.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered as eleven children, 171 through 181, built by three agents in separate worktrees and integrated here. The evidence for each workflow is on its own task; what this parent records is that they hold together through the public interfaces: the CLI authors, branches, settles and adopts; the viewer reads two grammars, the narrative and the family; the store propagates, blocks and reconciles; and the agent's context is grounded in the ids an edit takes.

Final gate on the integrated tree: `bun run check` exit 0 — both type-check programs, lint, formatting, 2705 module tests, 155 system tests, 8 repository-policy tests, twelve browser owners, zero failures. Log at /tmp/claude-1001/check-final-gate.log.

The tracked pipeline example (docs/design/semantic-pipeline/) builds from its stated source into a vault through the ordinary write boundary, draws six artifacts, and was exercised end to end in the running app; docs/design/semantic-pipeline/verification.md records what was run, what it produced, and what it does not cover.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Excalidraw is replaced. A board is now one semantic document: an agent states what a system IS — nodes, containment, relationships, ordered flows, named views, walkthroughs, code bindings — and the renderer owns every coordinate, so there is no box to move and deliberately no way to move one. A proposal is a variant beside what is current rather than a copy of a drawing; a parent's edit reaches every draft under it in one write and one version; what two states cannot agree about is written on the board in the words of the thing that found it, and a draft whose predecessor is itself in dispute is left alone until that decision is made. Adoption moves the current designation and freezes what it replaced.

The viewer draws the same board as an architecture or as a sequence, explains it in a walkthrough beside the picture, discloses what a state is waiting on, and follows a link down a level by moving the pane's own address. An agent's context is grounded in the ids an edit takes, and a write says both who held the board and which pane it was for.

Legacy .excalidraw.md notes are untouched and unmigrated, by design and by measurement. Verified by `bun run check` exiting 0 on the integrated tree — 2705 module, 155 system, 8 repository and twelve browser owners — and by independent QA at 1920x1080 through the running app.
<!-- SECTION:FINAL_SUMMARY:END -->
