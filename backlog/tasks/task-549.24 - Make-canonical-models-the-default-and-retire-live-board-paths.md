---
id: TASK-549.24
title: Make canonical models the default and retire live board paths
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T18:04:00Z'
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

Merged signed backend contract checkpoint949d23ecf through merger4d340e40, without treating it as backend acceptance. Parent deleted the duplicated frontend projection and imports shared modelContent/projectModel/projectFlow from @archboard/board/content. The pane socket validates ArchitecturePaneReadingSchema and routes addressed pane_model arrivals through the existing router. Explicit model arrivals start the requested captured walkthrough only after navigation; ordinary presentation steps keep the existing capture. Agent navigation does not activate the shown conversation. The new browser owner proves pane B scope navigation, reload, requested walkthrough beat, unchanged neighbor, and user departure. Walkthrough and narration regressions pass. Frontend types, focused source lint, and focused browser test lint pass. No lint/type rule or deadline changed. README visual recipe transition and generic voice/shell/rendering fixture ports remain parent-owned.

Parent ports the generic voice-box and text-workbench fixtures to real canonical files read through the public model interface. The sign-in, held-message, and approval workflow passes. Ordinary canonical readings now mount the existing voice overlay. The voice-box owner exposed a remaining startup flight failure; its assertions remain intact, and diagnosis is recorded externally. This signed checkpoint permits integration of the next backend voice-context checkpoint and does not claim browser acceptance.

Merged backend checkpoint56447f6f through signed mergee351f4e7. The canonical voice-box owner still catches startup flight, while the same owner passes against signed .23. Parent moved the ordinary overlay into the canvas area; diagnosis remains open. README evidence fixtures now use canonical initialization, claims, edits, adoption, and two independent proposals over their own real source repository. The first CLI smoke exposed model init rejecting its documented --doing option. Backend delegate supplied a focused RED/GREEN fix at e52aa826; the parent will integrate it before continuing the real consumer smoke. No final acceptance is claimed.

The README evidence smoke now succeeds through shipped model init, model claim/edit/release, adoption, and two independent proposals. Locality reads nine real Git commits. Footprint reads two branch commits and returns all three comparison categories. Fixed the temporary input path and all four README lint findings without rule changes. Focused recipe lint passes. The film selectors and remaining visual recipes still need transition, so this does not claim visual acceptance. Voice diagnosis identifies preparation before a pane transport exists; the frontend now supplies its ordinary overlay during preparation, with an empty transcript until transport arrives. The unchanged browser owner is running against this repair.

The ordinary canonical voice-box owner now passes all25 assertions. The repair mounts the preparing overlay before a transport exists and switches to the real transcript feed when it arrives. Orb motion code and assertions remain unchanged, and all temporary probes are removed. The second text-workbench owner passes after waiting for actual pane registration; source types and focused source lint pass. Generic presentation and live-voice fixtures now use canonical narratives. Their continuing acceptance remains open. Presentation observations now select the visible box because the retained ordinary reader stays hidden during captured playback.

Backend signed checkpoint 56447f6f contains canonical initialization, shared projections and pane navigation, local agent selection/focus news, code checks, locality and branch footprint. Live legacy runtime writers/readers and obsolete exports are retired. Unchanged interface ceilings pass: board 188, code-intel 16, renderer 60. Source types/lint and touched-test lint pass. Focused runtime and adapter evidence is in the external task-549 directory. Frontend recording replay and final integration remain parent-owned. No repository identity mapping, cutover, adoption, task acceptance or closure is claimed. Keep In Progress with the parent assignee.

Backend follow-up: signed e52aa826 fixes shared --doing admission for model init. The shipped CLI regression is RED then GREEN (1 case, 5 assertions). Initialization passes 3 cases/13 assertions after simplification. After merging parent README consumers, the obsolete commands entry and its input protocols retire. Exact source evidence stays under model. The board interface narrows to 184 and its ceiling drops to 184. Command/schema/history owners pass 66 cases/102 assertions, touched non-browser test lint passes, backend source lint passes, and source types pass. The repository still returns LEGACY_AUTHORITY with all 17 original inputs unchanged. Draft proposal validation and adoption await parent mapping/cutover. This delegate stopped only its own port 10648 server. Task remains In Progress with the parent assignee.

Backend handoff boundary: examples/canonical-model and the pipeline builder/gallery use canonical operations. Parent owns conversion of the three examples/web-shop semantic inputs together with README flows, narratives, films, and selectors. No web-shop identities or mappings come from the backend builder. Final backend source types, full source lint after f892ca60c, touched non-browser test lint, and changed-file formatting pass. Deterministic skill validation passes 8 scenarios, 8 fixtures, 14 coverage parts. Removed stale consumer reference instructions that still suggested retired live board commands. Final full integration, frontend acceptance, repository migration, proposal adoption, and task acceptance remain parent work.

Final backend47c7d1c is integrated through signed dcb0e552 with parent notes preserved. Canonical fullscreen now hides the existing navigation, inspection, selection, and state controls through the shared presentation convention. The updated live-voice owner first reproduced the visible chrome failure, then passed that section. It next reproduced missing user-selection speech during captured narration. Captured playback now uses the existing canonical selection hook, with authored selection restored for each beat and temporary human selection kept separately. The existing pane user-marks path recognizes canonical captures and credits human selection through ModelExplanationHost, without a second publisher. Live voice and selection/walkthrough regressions pass. Frontend types, focused source lint, and focused browser lint pass. The large voice fixture moved to existing canonical-page support without changing its behavior or weakening the line limit. Scope/filter gesture marks and remaining shell/replay/asset/migration acceptance remain open.

The focus browser owner reproduced missing human view attribution through the existing pane context route. Explicit scope, focus, mode, filter, bookmark, state, and comparison gestures now mark their existing context fields; automatic identity normalization and agent arrivals keep the raw unmarked navigation path. Preview readings do not queue these marks. Focus-origin and agent-navigation owners pass, along with frontend types and focused source/test lint. Canonical replay also passes against the current frontend build, resolving the backend handoff stale-build limit. No passing replay or voice owner was repeated without a relevant change.

A human repository Open now goes through the existing shell action and canonical pane-show route, then activates the destination checkout through the existing conversation action. RepositoryModelLink no longer writes the router independently. The controlled text-workbench owner proves the destination conversation and pane B capture/vault agree while pane A stays unchanged; prior agent navigation still leaves the shown conversation unchanged. Full source/test types, frontend types, and focused lint pass after adapting the existing navigator fixture. The shared visible workbench reader moved to its existing support module to keep the test file bounded. URL restoration, keyboard repository opening, and removal of retired shell compatibility paths still remain open.

The controlled two-repository workbench case exposed a reload mismatch: pane A displayed shop architecture but remained connected to the orders vault. The existing workspace restore planner now compares actual pane repository placement with URL intent and carries complete canonical selectors through its existing operation slot and pane-show route. Human repository opens now use that same command slot. Model addresses remain intact when the socket confirms a canonical move. Canonical state attribution includes model identity so state IDs from different models do not leave a stale human mark. Reload, all three existing routing UI owners, and agent navigation pass. Full source/test types and focused source/UI/browser lint pass. No new restoration pipeline, deadline change, or lint exception was added; temporary probes are removed.

The repository keyboard owner first reproduced stale board-based filter counts (0/0 for one match among two repositories). Counts now describe repositories. Filter Enter, repository row Enter/Space, and pointer opens use canonical models. Alt+Enter uses the existing adjacent-pane owner, waits for a new pane registration, and preserves the original active pane. The real browser case covers opening current roots, creating a neighbor, and reusing that neighbor from the filtered tree. It passes, as do full source/test types and focused lint after memoizing the count object. No legacy view or board is created.

Parent canonical pane follow-up: removed the retired board-show HTTP request shape. Existing pane URLs now resolve captured legacy addresses through canonical navigation. The installed bookmark browser owner starts from a retained original pane URL, opens current, and preserves bookmarks, walkthroughs, reload, and unavailable-content behavior. Focused browser owner, full source/test types, and touched lint pass. The initial preview capture assertion was discarded because retained originals intentionally disable agent explanation captures.
<!-- SECTION:NOTES:END -->
