---
id: TASK-018
title: Emit semantic change events from the canvas
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 18:37'
updated_date: '2026-08-19 20:03'
labels:
  - needs-triage
dependencies: []
ordinal: 18000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The canvas emits semantic changes (node added, edge severed, binding changed), not element deltas
- [x] #2 Consumable by both the injection client and a hook doing its own diffing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New pure engine src/core/changes.ts: diff two snapshots of the SAME board and speak compare.ts's vocabulary. Reuse compareBoards() rather than inventing a second model — before diffing, stamp a synthetic node id (el:<elementId>) on every non-connector element that has no customData.archboard.node, so the same-board diff joins on element identity for un-promoted shapes and on node identity for promoted ones. Detect promotion/demotion by element-id overlap between an added node and a removed synthetic one (and the reverse), so promoting a box reads as 'promoted', not 'one node gone, one node arrived'.
2. Event-worthiness: nothing emits per mutation. Mutations only arm a settle timer (quiet window, default 1200ms), so a drag's stream of element updates collapses into one comparison of the settled board. On settle, diff baseline->current, classify significance: structural (nodes/edges/promotions), layout (cluster, containment, group, region, relation, prominence — all relative, straight from compare.ts), cosmetic (colour/size only). Cosmetic-only and empty diffs emit NOTHING and, crucially, do NOT advance the baseline, so a run of sub-threshold nudges accumulates until it crosses a real threshold instead of being lost.
3. src/core/change-feed.ts: per-board baseline snapshot + settle timer + monotonic cursor + ring of checkpoints (snapshot at each emitted event) + in-process subscribers. Records origin per window ('human' from frontend_sync change reports, 'agent' from the API routes, 'mixed'), because the injection client must not narrate the agent's own drawing back at it. Board open/new/switch resets that board's baseline instead of emitting a whole-board diff.
4. Server wiring: every mutating route in server.ts notes the board and origin with the feed (POST/PUT/DELETE elements, batch, changes, clear, import, board open/new).
5. Two read surfaces, one for each consumer. GET /api/changes?since=<cursor>&board=&coalesce=1 — events after a cursor for the injection client, or one coalesced diff from the checkpoint at that cursor for a UserPromptSubmit hook that has been away several turns. CLI 'changes [--since N] [--coalesce] [--text]' is the hook's front door; --text renders the compact narration used for injection.
6. Verify: unit-exercise the engine directly (drag below threshold, drag out of a cluster, edge cut, promotion, agent add) and then the real round trip on the canvas with a browser attached — drag a box, confirm one event and not a stream.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine and feed landed. src/core/changes.ts diffs two states of one board by stamping synthetic node ids (el:<elementId>) on un-promoted, non-connector elements and handing both sides to compareBoards — so every signal compare already computes (nodes/edges added, removed, changed, rerouted; clusters, containment, groups, region, relative direction, prominence) applies to shapes nobody has promoted yet, and the two tools cannot drift on what 'left the cluster' means. Promotion is matched by element-id overlap and reported as promoted/demoted/renamed rather than as a removal plus an addition, which was the one genuinely misleading reading available.

src/core/change-feed.ts holds the settle window (ARCHBOARD_SETTLE_MS, default 1200; hard cap ARCHBOARD_SETTLE_MAX_MS 6000 so continuous drawing still reports), the per-board baseline, a monotonic cursor, a ring of events plus the snapshot each was diffed against, and in-process subscribers. Cosmetic-only and empty diffs emit nothing AND leave the baseline where it was, so a run of individually meaningless nudges still adds up to a real change instead of being discarded one step at a time.

Wired every mutating route in server.ts through noteChange(); origin is 'human' for the browser's change reports and 'agent' for the API. mermaid needed expectAgentEcho(), because its render comes back through the same change report a human drag uses and would otherwise be narrated back at the agent that drew it. switchCanvasTo() resets the baseline so opening a board is not reported as several hundred additions.

Read surfaces: GET /api/changes?since=&board=&coalesce=&detail= and CLI 'changes'. Events-after-cursor is the live-watcher shape; --coalesce is the hook shape (one net diff from the cursor to now, and an honest 'truncated' answer when the checkpoint has aged out of the ring rather than a diff from the wrong place).

Exercised the engine directly against nine hand-built scenes: 12px nudge -> nothing worth an event; drag out of the cluster -> layout, with the relation and region changes; edge cut -> structural; reroute -> reroute inferred; unlabelled box drawn -> structural; promote it -> 'promoted', not add+remove; rebind -> field-level change; recolour -> silent; empty board -> first drawing. Still to fix from that run: cluster/relation lines print raw node ids (including synthetic el: ones) instead of names.

Verification of the event model, and two things it caught.

Exercised the engine directly (scripts/check-changes.mjs, now part of `bun run test`): a 12px nudge is "none"; dragging a node out of its cluster is "layout" and reports the node as leaving the company it kept; cutting an edge is structural and names both ends; moving one end infers a reroute; a box the human drew and nobody promoted is still reported, described rather than identified by id; promoting it reads as "promoted" with no phantom add/remove and no phantom cluster churn; recolouring is cosmetic and silent.

Then the real round trip, browser attached: canvas server started with a fixture vault, three nodes added by CLI (agent origin), then a box dragged out of the row in Chrome. One event, human origin, significance layout, headline "the grouping changed — a cluster split, AuthService, Postgres moved between clusters", and per-node lines reading 'AuthService moved: sits on its own (was with "Gateway", "Postgres")'. The agent-origin add produced its own event and no injection.

Two problems the live run found, both fixed:

1. elementCount hijacked the headline. archboard stores a labelled shape as ONE element with the label inline; the browser syncs it back as a shape plus a bound text element. compare counts elementCount as a semantic field (right for two independently authored boards), so every node the agent drew reported "elementCount 1 -> 2" the first time a human touched the board, and that became the headline instead of the cluster split. Filtered in the live diff only (STORAGE_ARTEFACT_FIELDS in changes.ts) — nothing was added to the architecture, the drawing is simply stored differently. compare's own behaviour is unchanged.

2. Promotion churned the layout. Resolved by canonicalising identity BEFORE the diff — element-id overlap maps the old node id onto the new one, so compare sees one continuous node whose fields changed, and the promoted shape is no longer counted as both a departure and an arrival.

Also added after the live run: feedId. Cursors only mean anything within one canvas process (the board is in memory, the count restarts with the server), and a hook's state file outlives the canvas. A cursor ahead of the feed now answers truncated with an explanation, instead of the most damaging wrong answer available — "nothing has changed".

Narration was tightened so nothing prints a node id: names everywhere, "sits on its own (was with X, Y)" for cluster membership, and at most two board-level cluster lines because a board that breaks into five clusters otherwise describes the same event from five sides.

CLAUDE.md's "No change-event feed" gap and DESIGN.md's matching row are now false and were updated.

Orchestrator verification: a backgroundColor change produced no event ('Nothing has changed'), a new promoted node produced named events including 'cluster formed: joined by Settlement'. Narration uses names, not ids. Filed TASK-022 for region noise seen in the same run — adding a node at the board edge reframes the bounding box, so two untouched nodes reported region moves. Noise rather than a wrong answer, but in the injection path it reaches the agent as a false statement about what the human did.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Semantic change events reuse compareBoards() by stamping synthetic node ids on un-promoted elements, so the existing signal vocabulary applies to un-promoted boxes and changes/compare cannot drift. Mutations arm a settle timer rather than emitting; significance is ranked structural/layout/cosmetic/none and only the first two are events; a silent diff does not advance the baseline, so small nudges accumulate instead of being discarded one at a time. Promotion is resolved before the diff so it reads as promoted rather than deleted-and-arrived.
<!-- SECTION:FINAL_SUMMARY:END -->
