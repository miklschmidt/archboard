---
id: TASK-095
title: 'An agent says what it is doing on every write, and the wall shows it'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-22 16:04'
updated_date: '2026-08-22 17:42'
labels: []
dependencies:
  - TASK-080
  - TASK-074
references:
  - src/server.ts
  - src/core/board-lock.ts
  - src/core/injection.ts
  - frontend/src/canvas/useCanvasSession.ts
  - skills/excalidraw-skill/SKILL.md
  - CLAUDE.md
priority: high
type: feature
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Asked for by the user, and it is the other half of the principle CLAUDE.md now states: creators need an immediate connection to what they are creating. Seeing *what* changed is one half. Knowing what the agent thinks it is doing while it does it is the other, and today the person gets nothing — boxes move and they infer the intent afterwards, if they can.

## The shape

**Every board-mutating call requires a short description of the action.** Required, not optional: the point is that an agent cannot change somebody's board without saying why, and being made to write the sentence is itself the forcing function.

**It is never written to the note.** It is not board content, and not a record of what the board used to be; it is what somebody said while doing something. It dies with the session, which is exactly the carve-out ADR 0015 already draws for sockets, panes and focus.

**It travels over the WebSocket**, board-scoped like `board_lock`, `board_hold`, `board_released` and `board_switched`. The pane keeps a short list — the last few actions, not a transcript — so a person glancing at the wall can see what has been happening and in what order.

**It can feed the live model** where one is attached, through the existing injection path. Note ADR 0005's constraints rather than discovering them: injection is off unless `ARCHBOARD_INJECT=1`, refuses on a non-loopback bind, and is quiet by default (`thread/inject_items` appends without starting a turn). **And an agent's own drawing is never injected back at it** — so this needs to know whose descriptions are whose, or an agent narrating to itself is the first bug.

## What it composes with

TASK-080's claim already carries a `reason`, shown as a banner: *An agent has this board: redrawing the payment path*. That is the campaign. This is the step. They should read as one story — the banner says what is being attempted, the list says how far it has got — rather than two competing accounts of the same thing.

The change feed is adjacent and must not be conflated with it. The feed reports what the board **became**, computed by diffing; this is what an agent **said** it was doing, which is a claim about intent that no diff can recover. A move that produces no visible change still has an intent, and a description that turns out to be wrong is still what was said.

## Two things to decide rather than assume

**What the field is called.** `description` is the user's word and they asked for a better one. It wants to read naturally at a CLI (`--why "..."`), as an MCP tool argument, and in a sentence on a wall display. `why`, `intent`, `doing` and `because` are all candidates; pick one and use it on every surface.

**Required means required, and every caller moves in this task.** Breaking them all at once is fine — the user said so explicitly — provided none is left behind. Stage 1 (TASK-068, TASK-083) collapsed every fan-out into one batched write per intent, so there is a single boundary where the lock is already taken and this can be demanded, which is why this is buildable now and would not have been a week ago. Find the callers, do not guess at them: the CLI's commands, the MCP tools, and anything in `scripts/` that writes a board.

The one exception is a human's own change report, which arrives from a pane and carries no description. It is not an agent saying what it is doing, and it must not be made to invent one.

Bound the length. A list of one-liners is glanceable; a list of paragraphs is a log nobody reads on a 75-inch display from two metres away.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every agent-originated board mutation carries a short description, on the CLI and over MCP, and a write without one is refused
- [x] #2 The description never reaches the note, proved by saving and reading a board back
- [x] #3 It is broadcast board-scoped over the WebSocket and the pane shows a short list of recent actions
- [x] #4 A human's own change report is not required to carry one
- [x] #5 The claim's reason and the per-write descriptions read as one story rather than two
- [x] #6 Where injection is armed, descriptions can reach the live model without an agent narrating its own drawing back to itself (ADR 0005)
- [x] #7 The field's name is chosen once and is the same on both surfaces
- [x] #8 Every caller that writes a board is moved in this task — CLI commands, MCP tools and any script — with none left behind
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Name the field `doing`: --doing on the CLI, `doing` on every MCP write tool, ?doing= on the REST API. The claim already owns `reason` (why an agent has the board, the campaign); `doing` is the step, and the participle it forces is the sentence a wall wants.
2. src/core/board-doing.ts: normalise + cap one line, and keep a short per-board ring in kept() so a pane that reloads is not blank and injection can quote it.
3. src/server.ts: require it in the deny-by-default write-boundary middleware, where the lock is already taken and holderFromRequest already tells an agent from a person. Query param only, so it cannot be spread into an element and reach the note. Record and broadcast board_doing on finish, 2xx only. /api/elements/from-mermaid is outside that middleware and is required and broadcast on its own.
4. canvas-client.ts: setWriteDoing + withDoing on every write path, the way setRequestedBoard/withBoard already work, so no CLI caller can be left behind.
5. CLI: global --doing pulled out in run.ts beside --board. MCP: WRITES_BOARD list + DOING_PARAM applied in the loop that already injects BOARD_PARAM into required.
6. Frontend: the shell's Clear and Save carry the pane's clientId, so a person's own act is a person's write rather than an unnamed agent. Pane keeps the last few lines from board_doing; the bar shows the latest and the pane lists them under the claim banner.
7. Injection: leave consider()'s agent drop alone and carry the recent lines as context on the human's event, so self-narration is structurally impossible.
8. Every script that writes a board passes one through its own api() helper. New scripts/check-doing.mjs in the chain proves the refusal, the note, the broadcast and the human exemption.
9. Docs: CLAUDE.md, CONTEXT.md, ADR 0016, SKILL.md and the cheatsheet.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as `doing`: `--doing "..."` on the CLI (global, stripped in run.ts beside --board), a required `doing` argument on 19 MCP write tools, `?doing=` on the API. Not `why`: TASK-080's claim already owns why an agent has the board, so a second synonym at a smaller scale would be the two-accounts-of-one-thing the task warns about. The claim's reason is the campaign, a doing is the step, and the pane shows them stacked.

Required at the deny-by-default write boundary in src/server.ts, where the lock is already taken — one place knows a request is a board write, so no route added later can be the one that says nothing. holderFromRequest already separated a person (a pane, named by clientId) from an agent (unnamed), so AC4 falls out structurally rather than as a listed exception. /api/elements/from-mermaid is outside that middleware and asks on its own.

Carried as a query parameter: DELETE has no body, and a field inside an element's JSON is one careless spread from being persisted, which makes AC2 structural rather than a promise.

src/core/board-doing.ts keeps the last five per board in kept(), coalescing a line repeated straight after itself (import is three writes under one intent). Broadcast as board_doing, board-scoped beside board_lock; the list rides on each message and is sent to a pane that has just been handed the board.

Injection: consider()'s agent drop is untouched and the lines ride on the human's event in compose(). A description is by definition an agent's, and nothing joins an HTTP write to a thread on the app-server socket, so injecting them as events of their own would narrate an agent to itself in every single-agent session.

Callers moved: the CLI's global flag (every command), 19 MCP tools via a WRITES_BOARD list applied where BOARD_PARAM already is, 14 scripts through scripts/lib/doing.mjs plus their cli() wrappers, and the shell's Save and Clear, which now send the pane's clientId because an unnamed writer is the server's definition of an agent.

Revert-proof, every run reaching its report line: the middleware requirement 21 of 42 in check-doing; the broadcast alone 7 of 42 and 3 in live-session; seeding a late pane 1; the human exemption 2; the injection lines 1 in check-changes; the MCP schema 19 in parity and 2 in check-doing; the shell's status comparison 1 in live-session; the cheatsheet column 1 in parity; leaking the line into an element's customData 2 in check-doing.

`bun run test` green end to end on the committed tree, 23 suites. One earlier chain run failed in check-live-session because I ran other suites alongside it; that check drives a real headless browser and does not survive the contention. The clean run passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An agent must say what it is doing on every board write, in one line, and the canvas shows it as the write lands. The field is `doing` — `--doing "adding the payment queue"` on the CLI, a required `doing` argument on 19 MCP write tools, `?doing=` on the API — chosen over `why` because the claim's `reason` already owns why an agent has the board: that is the campaign and this is the step, and the pane shows them as one story.

Demanded at the write boundary where the lock is taken, so a route added later cannot be the one that says nothing; refused with DOING_REQUIRED and nothing written, on all three surfaces. A person's change report carries a pane id and is exempt, and the shell's Save and Clear now send that id so a button press is not asked for a sentence. It never reaches the note: it rides as a query parameter, and check-doing saves a board and greps the file. The last five lines per board live on the canvas, broadcast board-scoped as board_doing beside board_lock; the bar shows the newest and the pane lists them under the claim banner. Where injection is armed the lines reach the model on the human's event only, which is how ADR 0005's rule survives descriptions that are always an agent's.

Verified by scripts/check-doing.mjs (42 checks, new suite in the chain), three new assertions in check-live-session that read the pane and the bar out of a real headless browser, one in check-changes for the injection half, and a new section of check-surface-parity holding both surfaces and the cheatsheet's required-params column to the same requirement. `bun run test` is green, 23 suites. Nine reverts were run and each was caught: 21, 7+3, 1, 2, 1, 19+2, 1, 1 and 2 failing checks.
<!-- SECTION:FINAL_SUMMARY:END -->
