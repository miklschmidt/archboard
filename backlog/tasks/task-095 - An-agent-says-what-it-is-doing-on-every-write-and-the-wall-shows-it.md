---
id: TASK-095
title: 'An agent says what it is doing on every write, and the wall shows it'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-22 16:04'
updated_date: '2026-08-22 16:49'
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
- [ ] #1 Every agent-originated board mutation carries a short description, on the CLI and over MCP, and a write without one is refused
- [ ] #2 The description never reaches the note, proved by saving and reading a board back
- [ ] #3 It is broadcast board-scoped over the WebSocket and the pane shows a short list of recent actions
- [ ] #4 A human's own change report is not required to carry one
- [ ] #5 The claim's reason and the per-write descriptions read as one story rather than two
- [ ] #6 Where injection is armed, descriptions can reach the live model without an agent narrating its own drawing back to itself (ADR 0005)
- [ ] #7 The field's name is chosen once and is the same on both surfaces
- [ ] #8 Every caller that writes a board is moved in this task — CLI commands, MCP tools and any script — with none left behind
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
