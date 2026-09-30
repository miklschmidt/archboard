---
id: TASK-169
title: Design semantic boards and renderer-owned presentation
status: Done
assignee:
  - '@codex'
created_date: '2026-09-11 15:22'
updated_date: '2026-09-11 18:15'
labels: []
dependencies: []
documentation:
  - docs/design/pr-lens-renderer-assessment.md
  - docs/design/archify-graph-quality-research.md
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-renderer-fork-comparison.md
type: spike
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Human diagram editing has primarily repaired agent layout mistakes. Agents produce weak visual and typographic hierarchy. Explore a semantic board that lets a renderer own presentation, using the PR Lens and Archify investigations. This task covers the design interview and durable decisions; implementation scope follows agreement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The user confirms shared understanding of the product boundaries and proposed approach.
- [x] #2 Settled domain terms and consequential architectural decisions are captured in the glossary and ADRs, with superseded assumptions identified.
- [x] #3 The agreed approach identifies a concrete validation example and migration requirements.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Interview the user in dependency-ordered rounds, investigate factual prerequisites, and record settled decisions as they emerge. Present the resulting approach for shared-understanding confirmation before implementation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Round 1 settled: independent boards and explicit variants; agents author semantics and presentation intent, renderer owns geometry/style; initial human interaction is selection/inspection/navigation and agent-mediated content changes. Preserve legacy files, defer all migrations, drop Obsidian compatibility. Large pannable/zoomable diagrams are acceptable; no speculative fit-to-viewport, partitioning, or size-refusal policy. Recorded ADR 0023 and updated resolved glossary terms. Remaining design is not yet approved for implementation.

Round 2 settled: fork/adapt PR Lens or Archify and inherit the chosen renderer grammars; do not build from scratch or pre-limit to architecture and sequence. Nodes support one structural parent, while levels remain separate linked boards (system -> services; service -> modules). Nodes have name, optional responsibility and optional detailed description, with detail in inspection. Updated ADR0023 and glossary. Source comparison of renderer candidates is in progress before selecting one.

Round 3 settled: named views share board nodes and can be switched/displayed in the frontend; derive variant change labels deterministically from stable identities and show them in rendered views, never agent-authored flags; retain one optional primary binding per node and cross-repository boards. Current node comparison joins stable node IDs, but edge matching uses endpoint/label heuristics and comparison infers semantics from geometry. Preserve the comparison principle while replacing these assumptions for semantic records. Baseline selection and detailed change rules remain open. Renderer candidate research is in docs/design/semantic-renderer-fork-comparison.md.

Clarification: proposal variants are planning alternatives to the same board current variant. Their ordinary rendered views automatically show deterministic added/removed/changed labels relative to current; no separate comparison mode or user-selected baseline is required. Current renders as the baseline. Removed content is available from current for the derived depiction, not stored as a deleted item in the proposal. Detailed modified-entity rules and renderer choice are still unanswered. Recorded in ADR0023 and glossary.

Variant lifecycle reopened by the user: chained proposals (current -> A -> B) should show B relative to A; promoting A to current should retain the former current as named history. Need to settle branching ancestry, pinned versus live baseline versions, stable naming/current designation, and promotion/history semantics. Supersedes the immediately preceding always-diff-current rule. Q14 changed-entity semantics and Q15 renderer choice remain unanswered. User requested all outstanding questions be posed together.

Q14 accepted entity-local semantic badges. Q15 chose PR Lens and both grammars after user visual comparison; leadership narrative walkthrough requested (scrolling explanation with diagram highlights). Public schema/atlas exist; hosted narrative viewer is not in the renderer source. Q16 accepted single-parent branching tree; competing children already occur in leadership proposals. Q17 rejected pinned comparison baselines: children must follow evolving parent, rebase-like, and breakage must be visible. Reconciliation policy is not yet chosen. Q18 subsequently accepted lasting state names plus movable current designation and adoption history. Updated ADR0023/glossary; current legacy source has no persisted ancestry or atomic adoption command.

Q19-21 accepted: automatically carry nonconflicting parent changes into children while preserving child edits; explicit conflicts/broken references, no silent winner, retain last coherent rendering with reconciliation status and affected highlights. Former current states freeze as historical; drafts/current remain editable, historical correction is a distinct explicit operation. Agents author optional walkthrough headings/explanations/view and identity targets; viewer owns scroll/highlight/transitions/typography. Recorded in ADR0023 and glossary. Next frontier: repair trigger, adoption trigger, navigation, persistence and validation example.

Q22 corrected: descendant conflicts must be surfaced in the response to the command editing the parent, with guidance/instructions for that same agent to resolve them. No frontend Resolve with agent button; agents own content edits. Q23 accepted explicit adoption when architecture is implemented, not on approval/render/merge. Q24 accepted explicit board+variant drill-down targets and no implicit fallback to current. Updated ADR0023/glossary. Existing exact-key link resolution already refuses absent targets; current storage claims/versions are per variant, so any board-family transaction design needs an explicit change of ownership scope.

Q25-27 accepted: one versioned JSON document and one write/claim scope per board containing all variants, ancestry, views and current designation; atomic parent/descendant/conflict publication. Maintain adapted PR Lens code in this repository with license and originating revision, no separate release pipeline. Fresh-authored acceptance example is this feature: Excalidraw pipeline vs semantic-board pipeline, architecture and agent-edit sequence, leadership walkthrough, competing branches, propagation/conflict/adoption. Updated ADR0023 and glossary version/write ownership semantics. Checking final consequential model ambiguities before proposing delivery plan.

Schema preference: Zod is the canonical source, derive types and optionally export combined JSON Schema later; repo already has Zod 4.4.3 and PR Lens schema is Zod. Q28-30 accepted: only drafts automatically inherit; current is explicit edits and history freezes. Valid parent edit plus safe propagation/conflict records commit atomically; command distinguishes applied-needs-reconciliation from rejection and guides repair, not retry. Historical preservation is board-local; linked target lifecycle is visible, cross-board historical snapshots deferred. Recorded ADR0023/glossary. Consolidating implementation approach; remaining decisions are view/narrative variant ownership, field/order reconciliation, adoption eligibility, and historical correction scope.

Q31-34 and consolidated approach accepted. User explicitly pre-approved the breakdown and implementation, requested to-spec then to-tickets, and authorized autonomous Claude Opus 5 delivery through herdr. Canonical spec TASK-170 and dependency-linked TASK-171 through TASK-181 published. Validation example: newly authored existing/proposed board pipeline, both grammars, narrative, linked levels and variant lifecycle. Legacy files preserved, migrations and historical correction deferred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the design interview and source investigations. User confirmed all final decisions and pre-approved implementation. ADR 0023, glossary and implementation design capture the agreement; TASK-170 records 43 user stories and TASK-171 through TASK-181 carry executable acceptance criteria and native dependencies. Verified source evidence, document consistency and git diff whitespace; runtime verification belongs to the implementation tickets.
<!-- SECTION:FINAL_SUMMARY:END -->
