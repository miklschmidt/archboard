---
id: TASK-080
title: An agent may claim a board for longer than one write
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:17'
updated_date: '2026-08-22 15:11'
labels: []
dependencies:
  - TASK-067
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/design/server-is-the-truth.md
type: feature
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 9 of docs/design/the-plan.md. From the section ADR 0016 gained after TASK-067 was filed. TASK-067 builds the per-write mutex; this is the long claim on top of it, and it is deliberately separate because it is a different amount of work and a different set of risks.

WHY A PER-WRITE LOCK IS NOT ENOUGH. It fits most of what an agent does. It does not fit an agent that knows it is about to redraw a board, restructure a subsystem, or work through twenty elements. Taking and releasing a lock twenty times leaves nineteen gaps for somebody else to write into, and produces a board that was never in one consistent state while it was being built.

SO AN AGENT CAN CLAIM A BOARD and say how long it expects to need it. Three constraints came with the decision and all three are settled, not open:

1. A LONG CLAIM IS NOT A LONG UNATTENDED HOLD. The claim has a time to live, perhaps an hour, and the holder renews while it is working. Stop renewing and it expires in seconds. The time to live bounds how long a working agent may keep the board; the renewal interval bounds how long a dead agent keeps it. A flat hour with no renewal means one crash costs an hour, which is the whole board gone for everybody else. Both constants belong in the module TASK-066 creates.

2. A HUMAN CAN ALWAYS TAKE IT BACK. The lock excludes writers from each other. It does not lock a person out of their own wall, and an agent that has claimed a board for an hour must not be able to grey out a 75-inch display somebody is standing in front of. A human's touch revokes the claim, the agent is told, and it stops rather than fighting for it. An agent that has lost its claim finishes nothing further and says so.

3. THE PANE SAYS WHO HOLDS IT AND WHY. For a two-hundred millisecond write, disabled is enough. For a claim that may run for minutes, a person needs to know an agent is restructuring the board and roughly what it is doing, or the wall has simply stopped working for no reason they can see. So a claim carries a reason, and the reason is what the pane shows.

FAIL CLOSED. Change reports are deliberately not gated on the socket, so a pane whose socket has dropped never hears about a claim and would keep letting a human draw. Whatever TASK-067 decides for the per-write lock applies here and matters more, because the window is minutes rather than milliseconds.

SURFACES. Claiming and releasing are agent actions, so they need a CLI command and an MCP tool, held at parity by `scripts/check-surface-parity.mjs`. Teaching an agent when to use them is a separate task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent can claim a board with a stated reason and an expected duration, and release it
- [x] #2 A claim has a time to live and is renewed while the holder works; a holder that stops renewing loses it in seconds, not at the time to live
- [x] #3 A human touch on a claimed board revokes the claim, the agent is told it has lost the board, and it stops
- [x] #4 A pane whose board is claimed shows who holds it and the reason they gave, not just a disabled surface
- [x] #5 A pane that cannot hear about a claim does not let a human draw on a claimed board
- [x] #6 Claiming and releasing exist on both the CLI and MCP, proven by check-surface-parity
- [x] #7 A check shows a claim surviving twenty writes with no gap another writer could take
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. board-lock.ts grows the claim: a LockRecord carries `claimed`, and claimBoard/releaseClaim/claimOn/revokeClaim sit beside holdBoard. A claim is a hold with a longer lease, a reason and a deadline; the canvas renews the lease every LOCK_RENEW_MS while the claim stands, because a CLI agent is a fresh process per command and cannot renew anything itself.
2. The holder id survives across requests by living on the canvas, keyed by board: holderFromRequest consults the claim registry, so an agent write to a claimed board joins the claim reentrantly and passes nothing.
3. Revocation: a person's hold force-takes a claimed board (write-own-record, pause, read back token, as with a lapsed lease). Never a per-write agent hold — a person waits out a 20 ms write. The claim is marked revoked and the first agent contact of any kind, write or re-claim, is refused once with CLAIM_REVOKED.
4. Cross-canvas: the renewal that comes back refused is how a claim on another canvas learns it was revoked. And the poll ADR 0016 deferred lands here, over the boards on screen, only while panes exist, skipping a board with a pending free-linger.
5. Surfaces: CLI `claim` and `release`, MCP `claim_board` and `release_board`, paired in check-surface-parity and listed in the cheatsheet. CLAIM_DEFAULT_MS and CLAIM_MAX_MS join timing.ts.
6. The pane shows who and why: a banner keyed on `claimed`, with one deliberate Take it back tap, because view mode keeps pan and zoom and any-touch-revokes would punish looking.
7. Checks: check-lock gains the claim through a canvas (twenty writes, an agent rival refused in every gap, `since` never moving), revocation, told-once, and the cross-canvas poll; check-live-session gains the banner and the take-back in a real browser.
8. ADR 0016 amended with the in-flight answer and the deliberate touch; the-plan.md's open question closed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The claim lives on the canvas, keyed by the board, and the agent carries nothing between claiming and releasing: holderFromRequest looks the claim up by the board every call already names, so an agent write joins the claim's hold reentrantly instead of taking its own. That is what makes it usable from the CLI, which is a fresh process per command.

Revocation is the person's hold force-taking a claimed board, on the same read-back-the-token path a lapsed lease is taken over on, because two people at two canvases can decide to take one claim at the same moment. It never takes an unclaimed agent hold: a write is twenty milliseconds and is waited out, and taking a board from a write already running is the two-writers problem arriving through the door built to keep it out.

Told once, and on the first agent contact of any kind. Checking only writes would let an agent renew its claim straight back onto a board somebody just took.

The renewal had to stop using holdBoard. holdBoard takes a free lock, which is right for a writer and wrong for a renewal: a person at a second canvas takes the board and lets go a second later, and a renewal that took the free lock would put the claim back under their hand with nobody ever told. renewRecord renews what is already ours and refuses to take what is not.

The pane keys its banner on `claimed` on the lock record rather than on the presence of a reason, because a pane that has not been told who holds its board assumes an unknown agent holds it and carries the placeholder reason 'not yet known' — a reason-keyed banner would put that up on every socket blip.

Taking it back is one deliberate tap, not any touch: a held board still pans and zooms, so watching an agent redraw a board would otherwise end the redraw, and since nothing already written is put back, a hand resting on a 75-inch display would leave a half-finished restructure with nobody having decided anything. ADR 0016 amended to say so rather than leaving 'a touch revokes the claim' standing.

The cross-canvas poll is gated on a browser being connected: watchBoardLocks is pointed at the boards on screen when a socket opens and switched off when the last one closes. A pane exists only while something renders it, so a canvas with no tab has nobody to be wrong about who holds a board, which is what answers TASK-067's objection that a permanent per-canvas timer was too expensive for the case.

Reverting the poll first failed nothing at all. The second canvas had written the board itself moments earlier, which leaves a pending free-announcement that re-reads the lock file when it fires, and that timer happened to land after the claim was taken. The check now waits that canvas out before it starts listening, and the revert fails two.

Verification, all local unless noted.

check-lock goes 61 -> 107 checks. Reverting one decision at a time, each run reaching its report line (no run died part way, none reported nothing):

  3 of 107  an agent write does not join the claim (holderFromRequest ignores it)
 10 of 107  a person cannot take a claimed board (the steal in attempt)
  2 of 107  a renewal takes a free lock back instead of losing the claim
  4 of 107  the agent is never told it lost the claim (both refusals)
  2 of 107  no cross-canvas poll (the second canvas hears nothing)
 12 of 107  a claim is not marked as one on the lock record
  3 of 107  a claim never expires on its own
  5 of 107  nothing renews a claim's lease

(the first seven were measured at 102 checks, before the idle-claim block; the counts are from one consistent run each.)

Reverting the poll first failed NOTHING, and that was the check's fault rather than the poll's. See the note above.

check-live-session gains six checks in a real headless browser: the banner names the holder and the reason, the pane is in view mode, the button is there, the tap lands, one tap returns the board, and the agent is told CLAIM_REVOKED at its next write.

The CLI was driven end to end against a throwaway canvas: claim, then `add` with nothing passed between the two commands, then claim again (created: false), release (released: true), release again (released: false), and the three refusals — no reason, a bare --for 30, and no board.

Evidence per criterion.

1. CLI smoke against a throwaway canvas: claim --reason --for 2m, a write with nothing passed between the two commands, release. check-lock's canvas block does the same over HTTP.
2. The idle-claim block watches a claim across the whole lease it was written with and counts the renewals; the expiry block waits for a claim to end on its own. Reverting the renewal timer fails 5. Read it with the ADR amendment: the CANVAS renews, because an agent between two commands does not exist to send a heartbeat. Stop renewing is therefore a canvas that died, and it costs one lease.
3. The steal is checked against the module, through a canvas, and across two canvases; the agent is told CLAIM_REVOKED once, on a write or on a fresh claim; and a real browser takes the board back with one tap. 'It stops' is told-once plus the sentence it is told; an agent actually stopping and saying what it left behind is judgement, and TASK-081's.
4. check-live-session reads the banner off the live app: the holder, the reason, view mode, and the button.
5. The pre-existing fail-closed check, strengthened on main by 379aeca: the canvas is killed, the check waits for the process to exit rather than for an interval, and the pane is polled until it assumes the board is held. Green this run.
6. check-surface-parity: 41 tools against 50 CLI entries, 37 paired, claim/claim_board and release/release_board among them, both in the cheatsheet.
7. Twenty writes under one claim with a rival asking in every gap, once against the module and once through a canvas, plus the assertion that none of them waited — joining a hold is instant and queueing behind one costs the whole wait cap, which is the only way from outside to tell a write that recognised the claim from one that queued.

bun run test: 23 steps, green, both browser checks headless.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-21 14:50
---
TASK-067 landed the per-write mutex (src/core/board-lock.ts). Three things it left shaped for this one.

THE CLAIM IS holdBoard WITH A LONGER LEASE AND A REASON. The lock is already reentrant by holder id, so renewing is calling holdBoard again with the same id; `leaseMs` and `reason` are already arguments and the reason already travels to the panes on the board_lock message and into the refusal sentence ("held by an agent (redrawing payments)"). What is missing is a CLI command, an MCP tool, and a holder id an agent keeps across requests instead of the per-request one src/server.ts:holderFromRequest mints.

A HUMAN TAKING IT BACK IS releaseHold PLUS ONE RULE. Today a person's hold is refused while an agent holds the board, and the pane goes read-only. Revocation is the opposite: a touch takes the board from the agent. The place for it is the /api/boards/hold route, which already knows the holder is a person; it needs to steal rather than be refused when the current holder is an agent with a claim, and the agent needs to be told, which is what board_lock's holder field already carries.

THE PANE SHOWS WHO AND WHY. useCanvasSession returns `heldBy` next to `readOnly` and nothing renders it yet. That was left deliberately: for a 20 ms write there is nothing worth saying.

AND ONE REAL GAP THIS TASK INHERITS. A second canvas over the same vault is excluded correctly, because exclusion reads the lock file, but its panes learn a board is held when a write is refused rather than before the touch — nothing polls the lock directory. ADR 0016 now records that. For a per-write hold it costs milliseconds; for a claim running minutes it is a pane that is wrong for minutes, so the poll belongs here.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An agent can now hold a board across everything it is about to do to it, and a person can take it back with one tap.

A claim is a hold with a reason and a deadline, and the CANVAS renews it — an agent here is a fresh process per command, so between two of them there is nothing alive to send a heartbeat and no way to tell one reading code for two minutes from one that died. That is also how the holder id survives: the claim lives on the canvas against the board, so an agent write joins it by naming the board it already had to name, and carries nothing. Bounded three ways: the lease frees the board within seconds of the canvas dying, the deadline (ten minutes, an hour at most) bounds an agent that walked away, and the person bounds it whenever they like.

Surfaces: archboard claim / release, claim_board / release_board, paired in check-surface-parity and in the cheatsheet. The pane puts up a banner naming the holder and their reason — only for a claim, never for a twenty-millisecond write — with one deliberate Take it back, because a held board still pans and zooms and reading it must not end it.

Revoking is not undoing, and ADR 0016 now says what that means for the work in flight: the write already running finishes, everything written stays, and the agent is told once so it can neither keep the board by asking again nor be locked out of a board it may be asked to work on next. The plan's open question points there.

The cross-canvas poll ADR 0016 deferred is built, gated on a browser being connected, which is what answers the objection it was deferred on.

Verified: check-lock 61 -> 107 checks, eight reverts each failing between 2 and 12 of them with every run reaching its report line, six new checks in a real headless browser, the CLI driven end to end, and bun run test green at 23 steps.
<!-- SECTION:FINAL_SUMMARY:END -->
