---
id: TASK-152
title: >-
  A person's edit is optimistic, but the note still decides: version-check human
  writes and freeze content editing under an agent claim
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-06 12:59'
updated_date: '2026-09-06 18:20'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AGENTS.md carried the rule 'a person is never refused: never version-refused, an agent never makes the canvas stop responding, and never works out of sight'. That rule is wrong and is implemented in three layers. The intended design: the on-disk note is the single source of truth; a person's edit is an optimistic local update that must never let a pane drift from the note; a human write is version-checked like an agent's and refused when stale, after which the pane reconciles to the note; while an agent claims a board, panes showing it stop taking content edits (pan and zoom keep working) instead of a content edit revoking the claim; an agent may edit any board whether or not a person is looking at it, and every pane shows in real time which board an agent is editing. Where the old rule lives: ADR 0006 ('A person is never checked at all') and src/runtime/engine/board-version.ts statedVersion, which skips the version precondition for writer 'human'; ADR 0016 ('a person can always take it back', TASK-118 content-edit takeover) with revokeClaim in src/runtime/engine/board-lock.ts, the /api/boards/hold route in src/server/canvas/lib/application.ts, and the takeover and heldBy handling in src/ui/canvas/useCanvasSession.ts; the 'never works out of sight / restructure in the open' guidance in ADR 0016 and the archboard skill. ADR 0006 and ADR 0016 need superseding paragraphs or a new ADR, not silent edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A human element write carries the version the pane last saw and is refused with the same version conflict an agent gets when the note has moved
- [x] #2 After a refused human write the pane reconciles to the note on disk and shows no local state the note does not hold
- [x] #3 While an agent claims a board, a pane showing it accepts pan and zoom and rejects content edits, and a content gesture no longer revokes the claim
- [x] #4 A person can still release an agent's claim through one explicit control, and the agent is told it lost the board
- [x] #5 Every pane shows in real time which board an agent is editing, including boards no pane has open
- [x] #6 The rewritten AGENTS.md invariant matches the behaviour
- [x] #7 ADR 0022 records the superseding decision; ADR 0006 and ADR 0016 point to it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wire contract (both halves build against it): (a) a human element write (clientId present) must state expectVersion in the query of POST /api/elements/changes, 0 meaning no note; missing is 400 BAD_EXPECTED_VERSION, stale is 409 BOARD_VERSION_CONFLICT with versionConflict, document and version; skipped only while the board is held (not saving). (b) initial_elements, board_switched, elements_changed and board_released-with-elements carry version: number|null. (c) POST /api/boards/hold never revokes a claim; under a claim it answers with the holder as a refusal does today. (d) New POST /api/boards/take-back {clientId} revokes the claim and releases the lease (board to nobody, agent told once); exempt from the write boundary as the lock given back. (e) New boardless message agent_activity {activity: [{board, claim: LockHolder|null, doing: DoingEntry|null}]}, a full snapshot sent to every client on connect and whenever an agent lock or doing line changes on any board through this server; entries linger ACTIVITY_LINGER_MS after an unclaimed write (timing.ts).
2. Server and engine: remove the human exemption in statedVersion (same parsing for both writers, required for humans), keep rememberedBy agent-only; hold route without revokeClaim; take-back route; version on the four messages; agent_activity broadcast and snapshot; update comments that state the withdrawn rule (application.ts hold route, board-lock-contracts revokeClaim, hold-keeper); update owners: board-version-client (stale human write is 409), board-claim unit test (hold without revoke keeps the claim, take-back revokes), board-lock-api process test, write-boundary-policy exemption list.
3. UI: track noteVersion in the reporting state from the four messages and write replies; send expectVersion on reports and beacons; on 409 version conflict reconcile: replace scene and baseline with the refusal document, cancel pending reports, publish a notice that the change was withdrawn because the board moved; readOnly = !connected || agent claim; when a hold is refused for a claim, withdraw local edits to the baseline; take-back uses the new route; application keeps an agentActivity map from agent_activity; navigator marks claimed boards (live dot, reason) and shows the latest doing line while it lingers, for boards with or without a pane; update unit owners and rewrite tests/system/browser/claim-interaction.test.ts to the new contract (view mode under a claim, a drag takes no hold and revokes nothing, take-back releases through the route, pan and zoom still report the pane).
4. Docs: skill text in skills/archboard (take-back is explicit, no steering toward the watched board), ADR 0022 wording on selection under view mode; TESTING/DESIGN untouched unless wrong.
5. Verify: focused owners per package, then the complete bun run check in an isolated worktree; browser lane focus on claim-interaction, human-hold-persistence, live-session-convergence, hold-generation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 5e3a5daa on codex/task-150-ui-rebuild. Server: statedVersion parses the same for both writers and requires expectVersion on a pane's write (0 before any note); version carried on initial_elements, board_switched, elements_changed and board_released(elsewhere); /api/boards/hold no longer revokes and the lock refuses a human hold against somebody else's claim immediately instead of at the 400 ms deadline; new /api/boards/take-back; boardless agent_activity snapshot from src/server/canvas/lib/agent-activity.ts with ACTIVITY_LINGER_MS. UI: noteVersion in the reporting state, expectVersion on every human write and beacon, version-conflict reconcile to the refusal document with one notice, readOnly under an agent claim, take-back via the route, navigator agent-activity marker and doing line including unlisted boards. Docs: skill and reference wording, ADR 0022 selection sentence. Owners: board-version-client, board-lock-api, doing-activity, write-boundary-policy, note-version and agent-activity unit tests, claim-interaction rewritten, new human-version-refusal browser owner. Verification: fmt, lint, type-check, engine tests, test:modules, test:system, focused browser lane green; complete bun run check running in an isolated worktree.

Complete bun run check green on 5e3a5daa in an isolated worktree (2660 module, 322 system, 9 repository, 19 browser owners). e4caa45b adds the ensure:codex-contract step so a fresh checkout's lint no longer runs before the contract exists. Hold under a claim refuses immediately (lock wait loop breaks on somebody else's claim when not revoking).

Review correction (ee9a24c4): a version refusal no longer carries the element under an open text editor over. The pane shows exactly the refusal's document, closes Excalidraw's editor (blur after the note is on screen; Excalidraw's submit is a no-op for an element the scene no longer holds) and keeps nothing the note lacks. The same applies to withdrawal for a claim. Owners: note-version unit test flipped, human-version-refusal browser owner gained the open-editor scenario (typed text never reaches the note, next write lands against the new version).

Complete bun run check green on the review-correction tree (source identical to 3d0405aa) in an isolated worktree with a confined root outside the checkout; 5 system owners that read git ambience fail when the confined tmp root sits inside the checked-out worktree, which is a runner-setup mistake, not a product one.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-06 13:49
---
Ready for the maintainer's independent review; left In Progress on purpose.
---

author: @codex
created: 2026-09-06 16:24
---
Final independent review of 0d1706d06b21df1c72910a640dadad35cd37234a..28e148acd599f702fe895ed1519a6510322714da: [P2] src/ui/canvas/lib/reporting.ts:246 passes currentWithheldIds() during a version refusal, preserving local text absent from the refusal document. Closing the editor can subsequently report it against the new version and resurrect text removed by the winning writer. This violates AC2 and ADR 0022: the refused optimistic edit must be withdrawn and the pane must show the note. note-version.test.ts currently explicitly expects text survival. Reconcile the entire refused scene and active editor rather than using ordinary incoming-snapshot preservation. Task remains In Progress for correction. Verification at pinned TARGET in /tmp/archboard-final-review-28e148ac, confined state and memory-limited scope: lint, formatting, both TypeScript projects, frontend build and 2657 module tests passed. The complete check command stopped after 308 system passes and one public-start cleanup failure caused by inherited LOG_FILE_PATH; TASK-150.06 documents that this owner requires the variable unset. All 8 cases in that owner passed with LOG_FILE_PATH unset and confined XDG state. The 9 repository tests and full 19-owner serial browser lane then passed. No implementation files changed; this is a review, not a fix or acceptance. No live server or user vault used.
---

author: @claude
created: 2026-09-06 18:04
---
Codex finding on reporting.ts:246 validated and fixed in ee9a24c4. Empirically Excalidraw keeps the editor textarea open after the scene replacement and would write the text back on submit if the element were still present, so the pane removes the element outright and blurs the editor; the browser owner proves the typed text is gone from the pane and never reaches the note.
---

author: @codex
created: 2026-09-06 18:20
---
Re-review of ea89db1c..a970611dddd3407412b6da21d9f67dd1cd7cc250: the original P2 is partially resolved by 0651d41a; a new text draft absent from the note is discarded, but editing existing text still fails AC2. Remaining [P2] src/ui/canvas/lib/reporting.ts:403-408: applyNoteScene installs the note and then closes the old editor by blur. Excalidraw submits that textarea value into any matching text ID still in the scene, overwriting the just-restored authoritative text. Reproduced through the serial browser adapter by varying the new browser case to select seeded text id note, open it with Enter, select all and type draft, then trigger the same stale drag refusal. After refusal the editor was closed but the pane texts contained draft while the server note retained drawn by the agent. The assertion that draft is absent failed. Log: /tmp/archboard-rereview-existing-text.log. Ensure discarding the editor cannot submit its stale contents into the restored scene; cover an existing text element retained by the note as well as a new draft. No fixes made; finding remains open. Verification in a disposable checkout at TARGET with confined HOME/XDG/vault/Codex state and memory-limited sequential processes: lint, fmt:check, both TypeScript projects and frontend build passed; 11 focused module tests (board-version-conflict, note-version, composer-controls), 8 held-board recovery system tests, and the human-version-refusal (2 cases), claim-interaction and codex-text-workbench browser owners passed. A separate existing-text variation of the refusal browser owner failed as described on TASK-152. The probe changed only its disposable test setup, restored it afterwards, and never modified product source. This was focused re-verification, not a new complete bun run check.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A person's write is version-checked like an agent's and refused when stale; the pane withdraws the optimistic change to the refusal's document and shows one notice (board-version-client system owner, human-version-refusal browser owner). A hold never revokes a claim: a claimed board is view mode for people, pan and zoom still report, a drag takes no hold, and the lock refuses a person's hold immediately (claim-interaction browser owner, board-lock-api process owner). Take-back is the explicit /api/boards/take-back route and the agent is told once. A boardless agent_activity snapshot marks claimed and recently written boards in the navigator whether or not a pane has them open (doing-activity process owner, agent-activity unit owner, claim-interaction). ADR 0022 written, ADR 0006 and 0016 point to it, AGENTS.md and the archboard skill updated. Verified with the complete bun run check on 5e3a5daa.
<!-- SECTION:FINAL_SUMMARY:END -->
