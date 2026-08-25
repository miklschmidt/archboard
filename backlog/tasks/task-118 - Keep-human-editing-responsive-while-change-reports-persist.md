---
id: TASK-118
title: Keep human editing responsive while change reports persist
status: Done
assignee:
  - '@codex'
created_date: '2026-08-25 11:34'
updated_date: '2026-08-25 15:19'
labels: []
dependencies: []
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - frontend/src/canvas/change-reporting.ts
  - frontend/src/canvas/useCanvasSession.ts
  - src/core/timing.ts
modified_files:
  - AGENTS.md
  - CONTEXT.md
  - bun.lock
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/agents/test-suite.md
  - frontend/src/canvas/CanvasPane.tsx
  - frontend/src/canvas/api.ts
  - frontend/src/canvas/change-reporting.ts
  - frontend/src/canvas/hold-attempt.ts
  - frontend/src/canvas/useCanvasSession.ts
  - package.json
  - scripts/check-change-reporting.mjs
  - scripts/check-fixed-point.mjs
  - scripts/check-human-edit-performance.mjs
  - scripts/check-labels.mjs
  - scripts/check-live-session.mjs
  - scripts/check-lock.mjs
  - scripts/check-one-write.mjs
  - scripts/check-typed-text.mjs
  - src/core/apply-element-input.ts
  - src/core/board-lock.ts
  - src/core/board-write.ts
  - src/core/expand-elements.ts
  - src/core/timing.ts
  - src/server.ts
priority: high
type: bug
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Manual Excalidraw edits periodically stall even when no agent is interacting with the board. Diagnose the human-only path from Excalidraw onChange through the board hold, change report, synchronous note write, response document, and scene reconciliation. Human input must apply locally without waiting for server persistence. Keep the existing board mutex, leases, claims, renewal, version checks, and serialized agent writes. Agent writes must not become optimistic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repeatable browser performance check reproduces the human-only stall with no agent writes and records which stage causes the main-thread pause before a fix is chosen
- [x] #2 Dragging, resizing, and typing remain locally responsive while human change reports and note writes are in flight
- [x] #3 Continuous human edits use a bounded reporting cadence with periodic progress and one final trailing report after a longer idle settle; the cadence does not create visible report-time stalls
- [x] #4 The browser does not fan out duplicate board-hold or change-report requests during one continuous human gesture
- [x] #5 A successful human report converges the canvas and canonical note without replacing or disrupting a newer local edit
- [x] #6 A human can begin editing while an agent holds or claims the board; the local edit remains visible while the existing mutex orders persistence, and a content edit takes the board back under the existing claim rules
- [x] #7 Agent writes remain mutex-serialized and non-optimistic, and existing multi-process lock, lease, renewal, claim, and version-conflict tests still pass
- [x] #8 Panning and zooming do not count as content edits and do not revoke an agent claim
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Measured baseline and attribution

Keep the diagnostic as a disposable headless browser check and make it the first implementation step. The current probe builds a throwaway vault, seeds it only through human-origin change reports, drives trusted pointer input, instruments request counts and response stages in the page, and traces server durability calls. No agent write runs in the measured window.

The 800-element control stayed at 16.8 ms per frame. Its hold response took 2.4 ms, its report round trip took 38 ms, response JSON took 2.2 ms, pre-reconciliation conversion took 1.4 ms, Excalidraw scene replacement took 0.5 ms, and the server's two durability fsyncs totaled 12.8 ms.

The amplified 10,000-element run reproduced the periodic pause. Across five completed human drag reports in one session, each request body was 506 to 509 bytes but each response carried a 5,745,282 to 5,745,285 byte whole document. Response JSON took 22.7 to 28.8 ms, cleanup and conversion before scene replacement took 7.1 to 10.0 ms, and Excalidraw replacement took 2.2 to 4.3 ms. Four of five report responses coincided with a 33.2 to 33.4 ms animation-frame gap while trusted drag frames stayed at 16.7 ms. The synchronous note fsync pairs ran in the server process and did not line up with input-handler delay. This attributes the browser pause to processing and reconciling the full response document on the main thread, not to waiting for the note write. The same run also produced duplicate hold requests when a second `onChange` arrived before the first hold response set `holdingRef`.

Do not choose a different cause unless the retained check contradicts this attribution on the implementation branch.

## Preserved concurrency contract

- Excalidraw applies a person's content edit locally before any hold or report promise settles. A remote agent hold or claim no longer turns a connected pane into view mode. A disconnected pane still fails closed.
- The existing vault-backed mutex remains the only persisted-write boundary. Leases, claims, renewal, version checks, foreign-note conflict detection, and cross-process serialization remain in place for every note write.
- A human report stays optimistic only in the pane. Its persistence still waits for the mutex. An agent write remains pessimistic from request through persisted response and never adopts the human acknowledgement path.
- An agent write that has already started finishes. A content edit then takes or renews the human hold through the existing `/api/boards/hold` path, which waits out an ordinary write and revokes a claim under the current claim rules. Nothing rolls an agent write back.
- Panning, zooming, selection, focus, and pointer contact without a content delta do not take a hold, revoke a claim, or start a change report.

## Implementation plan

1. Add `scripts/check-human-edit-performance.mjs` from the disposable probe and wire it into `package.json` as a fourth sequential headless browser check. Update `docs/agents/test-suite.md` with its scope, headless requirement, isolation, timing, and diagnostic output. Use a throwaway vault and human-origin setup and measured writes. Record trusted drag, resize, and typing event latency; animation-frame gaps; hold, renewal, release, and report counts; report body and response sizes; response JSON time; canonical-correction application time; and server fsync time. Keep the large fixed fixture because it turns the intermittent response pause into a repeatable report-correlated missed frame. Assert that the measured window contains no agent-origin board write.

2. Replace the normal human change-report response document with a compact canonical acknowledgement. In `src/core/board-write.ts` and `src/server.ts`, snapshot the human mutation result before note settlement, persist it through the existing synchronous write boundary, then diff that submitted result against the final canonical content. Return only canonical corrections, including renamed ids as delete plus upsert, together with the written board version or fingerprint. The usual drag should return an empty correction set instead of the whole board. Keep the current agent answer shape and its optional explicitly requested document unchanged. Keep held-board full-report recovery explicit and covered rather than letting it become a second ordinary whole-scene write.

3. Change `frontend/src/canvas/api.ts`, `frontend/src/canvas/changes.ts`, and the reporting reducer to consume that acknowledgement. On success, advance the baseline to the sent report's `nextBaseline`, then patch it with any canonical corrections from the server. Track the fingerprints sent for each id. If an acknowledged id has not changed locally since send, apply a real canonical correction only when it differs from the visible element. If the id has a newer local edit, leave the visible element untouched, update only the server baseline, and keep the newer edit scheduled. A common successful drag must not call `api.updateScene` at all. Any uncommon correction still goes through the existing single `applySceneUpdate` seam with `captureUpdate: never`.

4. Preserve local edits when server news arrives during takeover. Update `mergeIncoming` and reducer events so a completed agent write advances the server baseline but does not overwrite a locally dirty version of the same id. The pending human delta is then written after the mutex grants the human hold. Remove the current `loseBoard` behavior that cancels reports, reloads the board, and drops the local edit when a human hold request loses or times out. Network or lock delay leaves the edit visible and pending; retry and conflict handling still decide whether it can persist.

5. Make hold acquisition single-flight in `useCanvasSession`. Track the in-flight request and last attempt independently of `holdingRef`, so later `onChange` calls join the first request rather than fan out while its response is pending. Renew at `LOCK_RENEW_MS` only while content remains pending or a report is in flight. Release only after the reducer is settled. Keep the current server hold, lease, claim revocation, and release implementations unchanged.

6. Split reporting into a fixed progress deadline and a trailing idle deadline in `frontend/src/canvas/change-reporting.ts`. Start a non-restarting `REPORT_PROGRESS_MS` timer at the first unsent content edit and restart a `REPORT_IDLE_SETTLE_MS` timer on later content edits. Start with 400 ms progress and 800 ms idle values in `src/core/timing.ts`, keeping the idle deadline below the 1,200 ms change-feed settle and the hold lease well above both. Allow one report in flight. If either deadline fires while one is in flight, record one queued delivery and recompute one latest delta after the acknowledgement. Continuous edits therefore make progress at most once per 400 ms, and stopping produces one final dirty trailing report after 800 ms. A trailing timer that finds no pending delta sends no no-op request.

7. Pass the Excalidraw elements supplied to `CanvasPane.onChange` into the session and classify content change before any hold or report effect. Keep selection and pane viewport reporting on their existing routes. Camera-only changes may update the pane report, but they must leave the content stamp, local edit count, hold state, and reporting timers unchanged. Keep the claim banner and explicit take-back control visible, but do not use `viewModeEnabled` for a known agent holder. A first actual content delta is the deliberate takeover act.

8. Amend ADR 0016 and its timing commentary to match the approved contract. Exclusion continues to govern persisted writers, while the person's local canvas is optimistic and an agent remains pessimistic. Replace the old statements that a remote hold must prevent the touch and that only the explicit button can revoke a claim. Document that content change revokes a claim, camera movement does not, and an already-started write finishes before the human report persists.

## Regression plan mapped to acceptance criteria

- AC1 and AC2: the new browser performance check first proves the current 5.7 MB response and report-correlated missed frame, then stays as the post-fix gate. It drives trusted drag, resize-handle movement, and real keyboard typing while delaying human report responses long enough to overlap more input. It asserts the visible geometry or text changes before the response, no report-correlated frame gap above the calibrated relative budget, a compact response, and no whole-scene replacement on an acknowledgement with no canonical correction.
- AC3 and AC4: extend `scripts/check-change-reporting.mjs` with a manual-clock sequence of content changes spaced below the idle deadline for several progress intervals. Assert periodic deltas, one final dirty trailing delta, no no-op tail, one in-flight report, and one queued delivery. The browser check counts exactly one initial hold while it is unresolved, renewal no faster than `LOCK_RENEW_MS`, and no duplicate change request for one deadline.
- AC5: reducer checks cover an acknowledgement after a newer move, resize, deletion, and typed edit. They assert that the visible newer edit survives, the baseline represents the canonical server acknowledgement, and the next delta converges it. Add a live-session case where the server returns a real canonical correction and another where no correction causes no `updateScene` call. End both by comparing pane, API document, and note.
- AC6 and AC8: add a focused live-browser lock case. Hold the mutex with an ordinary agent write and with a claim, begin a trusted human edit before persistence is available, and assert its local pixels remain. The ordinary write finishes first; a content edit then acquires the human hold, revokes the claim, and the next agent act receives `CLAIM_REVOKED`. In a separate claimed-board sequence, trusted pan and zoom produce pane reports only, leave the claim owner unchanged, and send neither hold nor change-report requests.
- AC7: keep and run `test:lock` for leases, renewal, claim lifecycle, takeover rules, release linger, and two-process exclusion; `test:version` for write preconditions and conflicts; `test:one-write` for one persisted write per accepted report; `test:reporting`; `test:browser`; `test:typing`; and `test:live-session`. Add assertions that an agent response is not exposed before `writeBoard` returns from persistence and that the compact acknowledgement branch is selected only for a human `clientId`. Finish with `bun run test` sequentially, never parallelizing the browser checks.

## Risks and review points

- The compact acknowledgement is safe only if it reports every server-side canonical correction, especially text-id renames, raw text settlement, bound-arrow back references, and stripped presentation links. Compute corrections after settlement and keep fixed-point, typing, and long-session document comparisons as the deletion test for omissions.
- A 400 ms progress cadence increases write frequency during long gestures compared with today's unbounded trailing debounce. The 800 ms tail and single-flight queue limit it, but the implementation should record actual request and fsync counts in the browser check before accepting the constants.
- The current ADR says a pane held elsewhere enters view mode and that claim takeover needs an explicit button. TASK-118 intentionally changes those two human-interface consequences, not the mutex itself. Review the ADR diff as a contract change before application code proceeds.
- Keep disconnected behavior fail-closed unless a separate task changes offline editing. TASK-118 concerns persistence in flight, not an unreachable canvas.

## Spec review remediation

- Add red manual-clock and browser/request/fsync regressions proving a final dirty human state is accepted under the 800 ms idle deadline, while continuous edits still receive non-restarting progress and no no-op tail is manufactured. Preserve one in-flight plus one queued latest delivery.
- Add red route regressions proving a default-origin request with no clientId uses the established agent response shape, and that no agent response is observable until persistence returns. Select the compact human acknowledgement with the same writer classification used by lock/doing middleware.
- Retain every prior exact-convergence case, especially the pane-intended pre-repair correction boundary and locally deleted baseline ids, then rerun focused acceptance checks and the full sequential suite.

- Add red reducer regressions for a progress/idle delivery that becomes due during server scene application and for empty final delivery release after canonical correction and edit-then-undo. Drain or re-arm the queued delivery when the last server update finishes, and emit release_if_idle whenever an empty branch becomes settled.
- Refresh stale four-browser and bounded-cadence agent-facing documentation; read the writing-for-agents instructions first if present in the repository.

## Final remediation refinements

The final reducer drains due work after the last server update, releases the hold when an empty deadline settles, and preserves a local edit that Excalidraw exposed before its onChange callback. Hold completion is guarded by exact attempt identity and generation across rapid board away/back cycles. Writer response shaping now uses the middleware writer classification. Canonical settlement preserves valid Excalidraw between-indices through fractional-indexing so a single human insert cannot cascade into whole-document corrections.

## Re-review cadence remediation

Add a manual-clock sequence with edits every 500 ms, between the 400 ms progress and 800 ms idle deadlines. Preserve the first edit as idle-owned, but remember when its progress deadline has elapsed; the next content edit before idle must make the overdue progress delivery immediately reachable instead of starting a fresh 400 ms window. Prove multiple progress reports, one in-flight plus one queued latest delivery, one final idle report, and no no-op tail before rerunning browser and full sequential verification.

## Standards re-review additions

Exercise the delayed A1, rapid A to scratch to A switch, and delayed A2 through the real browser session. Keep A1 identity alive across adoption and invalidate it by advancing the generation, then prove A1 completion neither clears A2 nor schedules a stale retry and A2 persists. Declare fractional-indexing 3.2.0 as an exact direct runtime dependency with the Bun lockfile, verify frozen resolution, and update the Change report domain definition for compact human acknowledgements versus agent answers.

## Final standards timing and documentation pass

Bind the lock lease guard to REPORT_IDLE_SETTLE_MS instead of a copied 400 ms expression, remove obsolete report-debounce terminology from AGENTS.md and timing comments, and refresh live-session and test-suite documentation for compact canonical acknowledgements, fixed progress plus idle delivery, and the delayed session to scratch to session hold-generation proof. Run focused lock and suite documentation checks, then the complete sequential suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented TASK-118 on the TASK-117 main baseline. Human reports now return compact post-persistence canonical corrections plus fingerprint/version; the pane advances from its sent baseline, skips ordinary no-correction scene replacement, and preserves newer per-id moves, resizes, typing and deletions. Input-conversion repairs and full canonical broadcast side effects are included, including bound-arrow back-references outside the submitted delta.

Human content remains locally editable while the unchanged vault mutex orders persistence. Hold acquisition is single-flight with pending-content retry/renewal; agent writes remain pessimistic. Reporting uses one in-flight plus one latest queued delivery, a non-restarting 400 ms progress deadline and an 800 ms trailing idle deadline. Camera and selection changes do not take the board; content does; explicit takeover and disconnected fail-closed behavior remain.

Acceptance evidence: test:human-performance passed on a 10,000-element human-only board with six 524-554 B requests, six 288 B document-free acknowledgements against a 5,744,795 B full document, zero no-correction scene replacements, no agent write, 9 hold / 6 report / 3 release requests, 12 fsyncs, and a 16.7 ms median / 16.8 ms worst report-correlated frame. Reducer reporting passed 88 checks; one-write passed 77; lock passed 119; version passed 65; trusted typing passed; fixed-point returned zero document changes; live-session passed all checks and converged after all 42 mixed-write cycles. Full sequential `bun run test` passed all 27 push suites, including all four browser checks.

Spec review blockers received after initial completion: AC3 reopened because the current progress acknowledgement can cancel the idle timer before it controls a distinct dirty final write. AC7 reopened because answer shaping uses origin instead of the established writer classification, allowing a no-clientId/default-origin agent-classified request to receive the human acknowledgement shape. Remediation will be test-first on the same branch.

Standards review added blockers: a fired delivery can be stranded as queued with pending edits and no reachable timer/in-flight report while a server update applies; empty final delivery can settle without release_if_idle after correction or edit-then-undo; AGENTS.md and the frontend API cadence comment are stale.

Remediation completed test-first. The 800 ms idle deadline now owns a lone final dirty edit; the 400 ms non-restarting progress deadline sends only when later edits prove continuous work. Reducer regressions also prove queued delivery drains after server scene application, empty correction and edit-undo deadlines release an idle hold, a pre-callback local edit remains reachable, locally deleted baseline ids remain deleted, and input-conversion repairs are returned as canonical corrections.

Writer response shaping now follows the lock middleware classification. A no-clientId/default-origin request receives the established agent document answer and remains unanswered behind a real human hold until persistence completes. Hold attempts use exact object, promise, and generation identity so stale away/back completion cannot clear or fan out a newer attempt.

The retained 10,000-element browser check observed the first report before isolating the final edit. It measured zero new reports at the progress deadline and exactly one accepted report starting 840 ms after the edit at idle, with no no-op tail. Five reports produced ten fsyncs; counts were seven holds, five reports, and two releases. All five responses were document-free and at most 1,071 B against a 5,744,795 B document; isolated no-correction acknowledgements caused zero scene replacements, no agent write occurred, trusted drag, resize, and typing stayed local while persistence was in flight, and the loose relative frame gate passed at 16.7 ms median and 49.9 ms worst report-correlated gap.

Final verification: change-reporting 105 checks; one-write 80; labels 183; lock 119; version 65; type-check passed; fixed-point returned zero changes; trusted typing passed; live-session converged after all 42 mixed agent/human cycles. The final sequential bun run test completed all 27 push suites with exit 0, including all four browser checks.

Re-review reopened AC3: edits spaced 401–799 ms apart can repeatedly outlive an uncontinued progress timer while restarting idle, starving persistence until editing stops. Remediation will begin with that exact manual-clock regression.

Standards re-review added a real useCanvasSession away/back hold regression, direct dependency declaration, and CONTEXT.md response-shape correction to this remediation round.

Final re-review remediation completed. An elapsed uncontinued progress deadline is now carried forward: the next edit before idle schedules immediate overdue progress instead of opening another 400 ms window. The manual-clock 500 ms sequence passed with two progress deliveries, one queued latest delivery behind one in-flight request, one final idle delivery, and no no-op tail. change-reporting now passes 114 checks.

The real live-session regression delays A1, switches session to scratch to session, starts delayed A2, completes A1 first, and keeps A2 pending through the stale-retry window. Hold counts remain 0 to 2 to 2, A2 remains owned, and its edit persists from x 100 to 113. The test then waits for all delayed responses before the ordinary session and all 42 mixed cycles converge with zero server-update bounce reports.

fractional-indexing 3.2.0 is now an exact direct runtime dependency in package.json and bun.lock. bun install --frozen-lockfile checked 534 installs across 554 packages with no changes, and a direct runtime import generated a2V between a2 and a3. CONTEXT.md now documents compact human corrections plus fingerprint/version and the retained agent touched-elements/fingerprint response.

Final verification: bun run test passed all 27 push suites sequentially with exit 0. Human performance observed zero send at progress and exactly one final report starting 837 ms after the isolated edit, five reports, ten fsyncs, seven holds, two releases, five document-free responses no larger than 1,071 B against a 5,744,795 B document, no agent write, no isolated no-correction scene replacement, and the loose relative frame gate passed. Lock 119, one-write 80, labels 183, version 65, fixed-point zero changes, typed-text, type-check, and live-session all passed.

Final standards review is spec-clean and requests only the live idle-to-lease test relationship plus browser-gate terminology and scenario documentation. The requested writing-for-agents skill is absent from the restored repository skills and session catalog, so the AGENTS.md fallback is a narrow factual terminology edit.

Final standards remediation completed. The lock timing guard now imports REPORT_IDLE_SETTLE_MS and proves LOCK_LEASE_MS retains two idle-settle windows, so a future idle increase cannot silently exceed the lease contract. Obsolete report-debounce wording was removed from AGENTS.md and timing comments. Live-session documentation now names compact canonical corrections, fixed progress plus trailing idle delivery, and the absence of ordinary whole-document reconciliation; test-suite documentation records the delayed session-to-scratch-to-session A1/A2 generation race and its stale-completion guarantees.

Final focused evidence: git diff --check passed; test:suites reported 27 of 27 push suites; test:lock passed all 119 checks. The complete sequential bun run test passed all 27 push suites with exit 0. The retained 10,000-element browser performance gate observed the isolated final report start at 830 ms, five reports, ten fsyncs, seven holds, two releases, no agent writes, no ordinary full-document response or reconciliation, a largest compact response of 1,072 B versus a 5,744,795 B document, and a loose relative frame gate of 16.7 ms median / 66.7 ms worst. The live-session browser check proved delayed A1, rapid session-to-scratch-to-session adoption, delayed A2, safe A1 completion with A2 still pending and no stale retry, A2 edit persistence, and 42 of 42 mixed cycles converged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Kept human editing locally responsive without weakening the vault mutex or pessimistic agent writes. Human reports use compact canonical acknowledgements; progress and trailing idle deadlines are bounded by the live lease contract; sparse continuous edits cannot starve persistence; holds are exact and generation-safe across delayed rapid board switches; and ordinary acknowledgements never reconcile a whole document. Verified by the full sequential 27-suite run, 114 reducer checks, 119 lock checks, the 10,000-element performance gate, fixed-point and typing checks, and 42 convergent live-session cycles.
<!-- SECTION:FINAL_SUMMARY:END -->
