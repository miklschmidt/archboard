---
id: TASK-143.04.12
title: Canonicalize realtime transcript item identities before browser projection
status: Done
assignee:
  - '@codex'
created_date: '2026-09-04 16:09'
updated_date: '2026-09-04 16:47'
labels: []
dependencies: []
parent_task_id: TASK-143.04
priority: high
type: bug
ordinal: 287000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-143.04.07 now completes SDP and started, then a valid final transcript such as controlled-user-transcript reaches voice.transcript[].itemId as the raw Codex wire value. BrowserSnapshot requires an authority-issued canonical ItemId and rejects the whole workbench state as invalid_projection. This child owns the exact raw-item-to-canonical identity boundary so the controlled live-voice browser owner can publish transcripts without weakening identity checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every item-scoped realtime transcript notification resolves its raw Codex item identity to the authority-issued canonical ItemId before the adapter retains or publishes a transcript record.
- [x] #2 Invalid, unissued, stale-authority, wrong-thread, and wrong-realtime-session item notifications do not mutate retained transcript state or publish a transcript event.
- [x] #3 A focused adapter-to-production-projection owner fails on the raw-item invalid_projection path before the fix and passes with the canonical item while proving invalid and stale items never publish.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the adapter public-boundary owners with three red recovery cases: a delayed second page, a late invalid item, and a cursor loop. Assert that transcript publication and raw-to-canonical issuance stay unchanged until the full page chain succeeds.
2. Add a red live-item boundary case at the identity authority maximum and one byte beyond it. Keep item/started as the sole introduction and prove an oversized raw item remains unissued.
3. Stage all matching recovery records across the complete cursor chain, reject bad pages or loops before authority adoption, batch-adopt once, build the merged entry map locally, then replace retained entries and publish once. Align the neutral transcript presentation length with the authority-owned canonical ItemId maximum without weakening ItemIdSchema.
4. Correct only the three stale raw-ID expectations in the focused process-contract owner, then run the permitted focused tests, both TypeScript projects, scoped lint/format, and fixed-base diff checks. Commit the complete range and return it for rereview without checking acceptance criteria or finalizing the task.

5. Correct the focused process fixture at both control-write sites by serializing the issued coordinator ThreadId back to its raw app-server value. Preserve the raw notification payloads and canonical transcript expectations, require the exact process owner to pass, then commit the isolated fixture correction.

6. Repair the existing adapter recovery owner only: introduce and complete two raw live transcript items, recover an overlay for one plus a new item, and assert canonical ordering, recovered role/text replacement, and preservation of the live-only record. Keep the cursor-loop proof and process owner unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red proof: the focused adapter-to-production-projection test received refused/invalid_projection for raw controlled-user-transcript before the adapter boundary changed. Implementation uses the existing identity authority ledger: item/started introduces an ID only after child, epoch, thread, session, type, role, and text validation; delta and completed resolve only already-issued IDs; recovery batch-adopts matching transcript IDs before inserting them. Rejected stale epoch, wrong thread, wrong session, invalid, and unissued reference paths leave the retained transcript and publication count unchanged. Validation is recorded in the delegated callback and commit; the task remains In Progress for parent review and final browser verification.

Independent review reopened the implementation at 6ccdbb6b with three required closures: full-pagination recovery atomicity, authority-safe presentation bounds, and canonical expectations in the existing process owner. The task stays In Progress and all acceptance criteria stay unchecked.

Rereview remediation proof: the new public adapter owner first failed all four cases. It exposed a first recovery page before a deferred second page, retained partial transcript and issued identities after a late oversized item and cursor loop, and dropped an authority-valid 4,096-byte raw item after issuing its 8,208-character canonical value. After the change, all four pass: no transcript record, transcript event, or item issuance occurs until every page and cursor succeeds; late invalid and loop failures leave the item ledger empty; the 4,096-byte value publishes canonically; and 4,097 bytes remain unissued. The permitted focused set passes 51 tests with 681 assertions, both TypeScript projects pass, and scoped lint, format, and diff checks pass. The exact process owner was run under a 20-second command bound and completed in 10.19 seconds with 1 pass and 3 failures. Its two negotiation cases time out before transcript assertions because the existing fixture substitutes the already-canonical coordinator ThreadId into notifications while the adapter resolves raw notification thread IDs. Its three transcript expectations now use resolveItemId as requested; the fixture was not changed. Browser and broad suites were not run.

Parent authorized the previously protected process-fixture correction after rereview. No new product scope or task was added.

Authorized fixture remediation is complete. Both control-write paths now serialize the issued coordinator ThreadId back to the raw app-server value before substituting $THREAD. The restart owner also serializes its fresh generation thread before direct started and SDP notifications, preserving the stale-old-child check and the fresh-answer assertion. The exact process owner passes 4 tests with 65 assertions in 1.84 seconds under the 20-second command cap. The focused relevant unit set still passes 51 tests with 681 assertions; both TypeScript projects, scoped lint, scoped format, and diff checks pass.

The independent rereviewer accepted the product behavior and found one low-cost unit coverage gap: the adapter recovery owner no longer carried a live record through the local merged-map path. This turn repairs that owner only.

Low rereview finding repaired in the existing adapter recovery owner. The owner now introduces and completes raw live items for one overlay identity and one live-only identity. Recovery replaces the overlay role/text/order, adds a recovered-only identity, and preserves the live-only canonical record at the live ordering slot. The duplicate cursor-loop subcase was removed from this owner because transcript-identity-atomicity.test.ts already owns that exact regression. A bounded mutation check replaced new Map(session.entries) with an empty map and the repaired owner failed solely because live-only disappeared; after restoring the product line, the owner passed. Final focused matrix: 51 tests, 679 assertions, all green. Root/frontend type-check, scoped Oxlint, scoped Oxfmt, and diff checks pass.

Final integration: review-clean commits 6ccdbb6b86a1160cb4bdc6199840b3d39d4344c1 -> 349be32dfc79b642ce8267541038c95dd7a1691f, d9106f3a6ae0d4084284185a3bde584464bc242a -> f6b3ddd82f162470084028031bfca2ed0b8ded1b, 3b85b08638728f7e39fa09831103a39f630126fe -> 862b227004777d618a2983c08f08f2a7965875e9, and ba6ca0c2c94815d917d066b209fec3fc7c6d6e55 -> f35b2c261cfaa53f1159a10ea081b44e816aa6fa. Review-clean evidence covered 52 focused tests with 650 assertions, both TypeScript projects, scoped lint and format, diff checks, and the exact process owner at 4 tests with 65 assertions in 1.84s. Post-integration checks passed the focused identity/projection subset at 35 tests with 558 assertions in 0.16s, the exact process owner at 4 tests with 65 assertions in 1.85s, and git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Canonicalized realtime transcript item identities before retention and browser projection. Invalid, unissued, stale, wrong-thread, and wrong-session notifications now fail without mutation or publication; recovery adopts identities atomically and preserves live overlays. Focused identity, projection, atomicity, and exact process-contract checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
