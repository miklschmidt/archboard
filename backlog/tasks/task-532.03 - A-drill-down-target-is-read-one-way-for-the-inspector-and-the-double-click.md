---
id: TASK-532.03
title: A drill-down target is read one way for the inspector and the double-click
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T05:44:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0036-a-renamed-board-keeps-answering-to-its-former-names.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
parent_task_id: TASK-532
ordinal: 954000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The double-click (use-drill-open.ts) and the inspector (use-drill-place.ts with GoDeeper.tsx) each assemble finding the place, reading the document, following former names and resolving the variant. The comment says they must agree, but they do not: when the vault listing fails, the double-click opens nothing while the inspector still resolves a place, so the inspector can offer a drill-down that the double-click cannot perform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One target reading has two adapters, a subscribing hook for the inspector and a promise for the double-click, both returning a ready destination or a named unresolved state
- [x] #2 A failed listing is treated the same way by both adapters
- [x] #3 use-drill-place.ts is removed; repository discovery, document reads, former-name tracking and variant selection are private to the target reading
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New module apps/web/src/ui/hooks/semantic-board-canvas/use-drill-target.ts: one target reading (private place step from the source listing and the machine's repositories, private destination step from the target document with variant selection and former-name tracking) behind two adapters: useDrillTarget(drillDown) subscribes for the inspector; useDrillTargetReader() returns (drillDown) => Promise<DrillTarget> for the double-click. Both answer one DrillTarget union: ready {board, variant, there} or reading, listing-failed, unregistered, unreachable, unreadable, no-variant, no-current.
2. Fix the divergence: a link that names a repository whose source listing failed is listing-failed in both adapters; neither guesses another vault. A query error wins over stale data in both, matching what fetchQuery answers.
3. GoDeeper.WayDown renders the DrillTarget; WayDownIn and use-drill-place.ts are deleted. use-drill-open keeps the gesture's currency check and opens only a ready target.
4. drill-target.ts keeps only the shared types (RepositoryPlace(s), OtherRepository, OpenDown); drillPlace, resolveDrillDown, drillTargetName become private to the reading; drillDownAsked moves to GoDeeper, its only user.
5. Tests: new apps/web/tests/ui/hooks/semantic-board-canvas/drill-target.test.tsx drives both adapters over one real QueryClient with a controlled fetch: own and other repository, unregistered/unreachable, failed source listing, missing named variant, former name. The drillPlace cases leave drill-across-repositories.test.ts. Double-click and late-answer cases stay in semantic-board-levels.test.tsx.
6. Focused checks under the heavy lock, commit by path with Refs: TASK-532.03.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in 09b7922b7. use-drill-target.ts holds one reading (placeOf, then destinationOf/variantOf, all private) behind useDrillTarget (inspector, subscribes and follows the board's news under its current name) and useDrillTargetReader (double-click, promise that never rejects). DrillTarget: ready {board, variant, there} | reading | listing-failed | unregistered | unreachable | unreadable | no-variant | no-current.
Decisions: a query error counts over cached data in the subscribing adapter, because fetchQuery in the promise adapter would refetch and fail; so both agree. A document fetch failure and an unparsable document are one state, unreadable (the inspector now says 'could not be read' for both). GoDeeper draws each unresolved state under data-slot semantic-drill-<kind>, which keeps the existing semantic-drill-unregistered and -unreachable slots. drill-target.ts keeps only the shared types; drillDownAsked moved into GoDeeper, its only user. The inspection test's 'could not be opened' wording check became a check of the semantic-drill-unreadable slot.
Evidence: apps/web/tests/ui/hooks/semantic-board-canvas/drill-target.test.tsx (7 tests, both adapters over one QueryClient; the failed-listing case fails when the reading guesses a vault, checked by mutation). Double-click and late-answer cases stay in semantic-board-levels.test.tsx. Checks: type-check 0, lint 0, UI semantic-board-canvas tests 245 pass, repository-policy 153 pass.

Review (review/drill-target, 76cc8f695): behaviour as specified; fixed the listing-failed copy (the link, not the board, names the repository). A test that a newer double-click wins over an older one answered later is being added (the current() guard was untested; predates this change). Vault: Board viewer still binds drillPlace and resolveDrillDown, which are gone; rebind in the closing step.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
use-drill-target.ts reads a drill-down target one way, as a hook for the inspector and a promise for the double-click, returning ready or a named unresolved state; use-drill-place.ts is deleted. Fixed: after a failed vault listing the inspector offered a drill-down the double-click could not open; both now answer listing-failed and guess no vault. Verified by drill-target.test.tsx (both adapters on one QueryClient), semantic-board-levels.test.tsx including a new test that a newer double-click wins over an older one whose board answers first.
<!-- SECTION:FINAL_SUMMARY:END -->
