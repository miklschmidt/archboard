---
id: TASK-549.24
title: Make canonical models the default and retire live board paths
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T15:20:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.13
  - TASK-549.16
  - TASK-549.18
  - TASK-549.23
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 954000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 24.

## What to build

The finished product needs one live model format and one authoring path.

New vaults use canonical models. Migrate the repository's architecture vault through the delivered workflow and retire the old live authoring paths.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.13, TASK-549.16, TASK-549.18, TASK-549.23
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New vaults use canonical models. Migrate the repository's architecture vault through the delivered workflow and retire the old live authoring paths.
- [ ] #2 Keep legacy decoding only for migration and retained historical readings. Remaining unmigrated vaults receive an explicit migration route, never an automatic rewrite.
- [ ] #3 Close the consumer transition across commands, agent context, code inspection, rendering, walkthroughs, and examples. Earlier slices own their functional changes and documentation.
- [ ] #4 Remove obsolete board ownership and level instructions. Complete the glossary, ADR, skill, and architecture updates without introducing a second storage abstraction.
- [ ] #5 Demonstrate the local workflow from discovery through proposal, adoption, history, and walkthrough. Reuse the focused evidence already owned by each slice.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Start from integrated TASK-549.23 at signed32021ec7. Delegate backend retirement and canonical defaults to gpt-6.1-sol in an isolated worktree. Parent owns all frontend, the repository migration, and final acceptance.
2. Publish the canonical creation, rendering, code-inspection, command, and unmigrated-vault contracts early. Use the approved public runtime seam with real files and Git and thin adapter owners. Preserve existing canonical behavior and the single archive and recovery owner.
3. Draw affected architecture proposals before implementation. Remove obsolete live board authoring and ownership paths, keep legacy decoding only for migration and exact retained originals, and expose an explicit migration route for unmigrated vaults. Do not rewrite them automatically.
4. Parent replaces browser legacy fallback with explicit migration guidance and completes canonical repository navigation and local-agent interaction. Use the existing browser seam for visible behavior.
5. Parent chooses repository identity mappings and explicit current/draft walkthrough views from real source evidence, dispositions completed obsolete drafts, and migrates the full tracked vault through the delivered public workflow. Preserve all original histories, active independent proposals, and exact old addresses. Do not combine proposals merely because names match.
6. Complete the consumer skill, command contracts, examples, glossary, ADRs, AGENTS.md, and architecture acceptance. Retire obsolete exports and behavior tests with clear replacement ownership. Preserve lint and type rules and the existing interface ceiling.
7. Demonstrate the local workflow from discovery through proposal, adoption, retained history, and walkthrough. Reuse focused evidence from completed tickets, run remaining integration gates, and simplify the final system before acceptance.
8. Merge completed source through a merger. Then perform the final code-review phase, fix findings, publish and ready the single integration PR against main, and clean implementer worktrees. Do not merge main.

Parent browser proposal Browser application@TASK-549.24 is VaQkKiQf. The shared projection contract moves unchanged to @archboard/board/content. LEGACY_AUTHORITY remains stable. Parent browser test first proves explicit migration guidance without drawing or rewriting legacy content, then reuses durable recovery and installed navigation acceptance. Parent removes live legacy pane mounting, legacy catalogue reads, and ownership/level controls while preserving exact original addresses through canonical migration selectors.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-549.23 is integrated in signed e7672f62 with parent note32021ec7. All 23 dependencies are complete. The owner already approved the full task graph, public runtime and browser test seams, gpt-6.1-sol worktree delegates, signed commits, and one integration PR. Read-only repository evidence lives in external task-549.24-live-readings.json and task-549.24-conflict-evidence.json. Their Archbrd origin is only a probe until the parent records the deliberate migration plan.

Parent browser RED/GREEN proves that an unmigrated repository receives explicit migration guidance without drawing or changing the legacy file. The same browser owner then exercises interrupted migration and durable recovery. Live legacy pane mounting and the legacy authority fallback are removed; pane sessions always report canonical readings. The retained preview reader remains available. The focused case passes with six assertions, and source types and full lint pass. The shared projection transition awaits the backend source merge.

Parent catalogue now uses only canonical queries and the shared event feed. It performs no live semantic-board listing or pane-inventory content projection. Migration guidance issues no retired semantic-board or lock requests. Removed the old board-move UI/client/hook and its retired dialog test, and removed the legacy claim banner; canonical ModelClaims remains its behavior owner. Removed EmptyBoardCatalog after the focused browser case exposed a remount/refetch loop from obsolete empty-board guidance. The migration case now passes. The latest type/lint runs found only an unused import after that deletion; the import is removed. Remaining parent work includes canonical navigation actions and socket handling, replacing retained shell compatibility fields, browser fixture/owner transition, shared projection imports, and full vault migration.

Backend contract checkpoint: external task-549.24-contract.md. Signed source 949d23ecfdcf7a1530e18ffab1ad9a08af70f56d is based on 615ce7a5c0a14b98589d6db6909048b77add2abb and required main a98f28811f4fa74233ae4a55e52b90d75defd93b; both ancestry checks pass. It supplies shared projection, ArchitecturePaneReadingSchema and pane_model handling, canonical initialization, and legacy retirement APIs needed by parent browser TDD. Validation is partial at this checkpoint; no task status or acceptance state changes.
<!-- SECTION:NOTES:END -->
