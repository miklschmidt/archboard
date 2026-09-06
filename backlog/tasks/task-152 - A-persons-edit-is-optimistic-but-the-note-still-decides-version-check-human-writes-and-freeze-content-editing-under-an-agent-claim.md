---
id: TASK-152
title: >-
  A person's edit is optimistic, but the note still decides: version-check human
  writes and freeze content editing under an agent claim
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-06 12:59'
updated_date: '2026-09-06 13:10'
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
- [ ] #1 A human element write carries the version the pane last saw and is refused with the same version conflict an agent gets when the note has moved
- [ ] #2 After a refused human write the pane reconciles to the note on disk and shows no local state the note does not hold
- [ ] #3 While an agent claims a board, a pane showing it accepts pan and zoom and rejects content edits, and a content gesture no longer revokes the claim
- [ ] #4 A person can still release an agent's claim through one explicit control, and the agent is told it lost the board
- [ ] #5 Every pane shows in real time which board an agent is editing, including boards no pane has open
- [ ] #6 The rewritten AGENTS.md invariant matches the behaviour
- [ ] #7 ADR 0022 records the superseding decision; ADR 0006 and ADR 0016 point to it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wire contract (both halves build against it): (a) a human element write (clientId present) must state expectVersion in the query of POST /api/elements/changes, 0 meaning no note; missing is 400 BAD_EXPECTED_VERSION, stale is 409 BOARD_VERSION_CONFLICT with versionConflict, document and version; skipped only while the board is held (not saving). (b) initial_elements, board_switched, elements_changed and board_released-with-elements carry version: number|null. (c) POST /api/boards/hold never revokes a claim; under a claim it answers with the holder as a refusal does today. (d) New POST /api/boards/take-back {clientId} revokes the claim and releases the lease (board to nobody, agent told once); exempt from the write boundary as the lock given back. (e) New boardless message agent_activity {activity: [{board, claim: LockHolder|null, doing: DoingEntry|null}]}, a full snapshot sent to every client on connect and whenever an agent lock or doing line changes on any board through this server; entries linger ACTIVITY_LINGER_MS after an unclaimed write (timing.ts).
2. Server and engine: remove the human exemption in statedVersion (same parsing for both writers, required for humans), keep rememberedBy agent-only; hold route without revokeClaim; take-back route; version on the four messages; agent_activity broadcast and snapshot; update comments that state the withdrawn rule (application.ts hold route, board-lock-contracts revokeClaim, hold-keeper); update owners: board-version-client (stale human write is 409), board-claim unit test (hold without revoke keeps the claim, take-back revokes), board-lock-api process test, write-boundary-policy exemption list.
3. UI: track noteVersion in the reporting state from the four messages and write replies; send expectVersion on reports and beacons; on 409 version conflict reconcile: replace scene and baseline with the refusal document, cancel pending reports, publish a notice that the change was withdrawn because the board moved; readOnly = !connected || agent claim; when a hold is refused for a claim, withdraw local edits to the baseline; take-back uses the new route; application keeps an agentActivity map from agent_activity; navigator marks claimed boards (live dot, reason) and shows the latest doing line while it lingers, for boards with or without a pane; update unit owners and rewrite tests/system/browser/claim-interaction.test.ts to the new contract (view mode under a claim, a drag takes no hold and revokes nothing, take-back releases through the route, pan and zoom still report the pane).
4. Docs: skill text in skills/archboard (take-back is explicit, no steering toward the watched board), ADR 0022 wording on selection under view mode; TESTING/DESIGN untouched unless wrong.
5. Verify: focused owners per package, then the complete bun run check in an isolated worktree; browser lane focus on claim-interaction, human-hold-persistence, live-session-convergence, hold-generation.
<!-- SECTION:PLAN:END -->
