// How long one writer holds a board, and how long a claim outlives one write.
//
// Split out of `timing.ts` when that file reached the length a reader can keep
// in their head. Nothing about the numbers changed: they are the same durations
// with the same reasons beside them, and the module's entrypoint still names
// every one of them.

// ── One writer at a time (ADR 0016) ───────────────────────────────────────
//
// `src/runtime/engine/board-lock.ts` is the only thing that reads these. It was built
// against them rather than around them, and the two it added since — the
// poll and the steal guard — are here for the reason the first three were: a
// number that governs the lock and lives next to the lock is a number the next
// person tunes without seeing what it pulls against.

/**
 * How long a lock is held without renewal before it lapses.
 *
 * The lock is a lease and not a flag, because a holder that dies mid-write
 * would leave a flag set forever and a board nobody can write until somebody
 * finds and deletes a file they have never heard of. The first crash costs one
 * lease, not the board, and this is what that crash costs.
 *
 * It has to clear REPORT_IDLE_SETTLE_MS plus a write with room to spare, or a
 * user's own lock expires during the gap between two reports.
 * 800 against 3000 is that room. What actually covers a long drag is renewal,
 * not this number, so raising it to survive a long edit is the wrong fix,
 * and it is paid for in how long a crashed holder keeps the board.
 */
const LOCK_LEASE_MS = 3000;

/**
 * How often a live holder renews.
 *
 * A third of the lease, so two renewals can go missing before anybody loses a
 * board. The two numbers say different things and the ADR keeps them apart:
 * the lease bounds how long a *dead* holder keeps the board, and the renewal
 * interval is what lets a working one keep it without the lease having to be
 * long. Pushing this closer to the lease trades the second property for
 * nothing.
 */
const LOCK_RENEW_MS = 1000;

/**
 * How long an agent waits for a board somebody else holds before giving up and
 * naming the holder.
 *
 * An agent waits rather than failing, because a user's hold covers one edit
 * rather than a session, so the expected wait is one edit plus REPORT_IDLE_SETTLE_MS.
 * When it does give up it says who holds the board and since when, so a voice
 * session has something to say instead of going silent.
 *
 * Keep it above LOCK_LEASE_MS. An agent waiting on a holder that crashed
 * should outlast the lease and get the board, rather than time out first and
 * report a holder that no longer exists. 3000 against 5000 leaves two seconds
 * for the wait to notice the lapse. This is the relationship most likely to be
 * broken by tuning, because the two numbers get tuned for opposite reasons:
 * this one for how long a person is willing to hear nothing, that one for how
 * long a crash costs.
 */
const LOCK_WAIT_CAP_MS = 5000;

/**
 * How often a waiter re-asks for a board somebody else is holding.
 *
 * The lock is a file, so waiting is polling: there is nothing to wait *on*
 * that a second process could signal. 50 ms against a lease of 3000 and a
 * write that takes about 20 keeps the wait feeling immediate — a handover
 * costs at most one poll — while a board held for the whole wait cap costs a
 * hundred reads of a small file rather than a spin.
 *
 * It is the granularity of the wait, so it is also the floor on how quickly a
 * released board is picked up. Raising it makes an agent look slow behind a
 * user who has just finished; lowering it buys nothing once it is under the
 * time a write takes.
 */
const LOCK_POLL_MS = 50;

/**
 * How long a process pauses after taking over a lapsed lease before it
 * believes it got it.
 *
 * Creating a lock file that is not there is atomic and settles itself. Taking
 * over one whose holder died is not: two processes can both decide the lease
 * lapsed, both write, and the second write wins. So both pause and read back,
 * and only the one whose own token is in the file goes on to write the board.
 * This is how long that pause is, and it has to comfortably exceed the gap
 * between two such writes for the read-back to be conclusive.
 *
 * It is paid only when a lease has actually lapsed, which means only after a
 * holder died. Nothing on the ordinary path waits it out.
 */
const LOCK_STEAL_GUARD_MS = 25;

// ── A claim: one writer for longer than one write (ADR 0016, TASK-080) ────

/**
 * How long a claim runs when the agent does not say.
 *
 * A claim is what an agent takes when it knows in advance that it is about to
 * redraw a board rather than move one box. This is the only number here that
 * bounds a *person's* wait rather than a machine's: for as long as it runs, the
 * board is claimed by somebody else, and the way out is the take-back on the
 * banner rather than waiting it out.
 *
 * Ten minutes is a redraw and not a session. Long enough that an agent reading
 * code between writes does not lose the board mid-restructure, short enough
 * that a claim nobody released stops mattering before the person who wanted
 * the board has given up on it.
 */
const CLAIM_DEFAULT_MS = 10 * 60_000;

/**
 * The longest claim anybody may ask for, however long they said.
 *
 * The expiry is what bounds a *working* agent — the lease and its renewal bound
 * a dead one — so this is the cap on how long the board can remain claimed
 * without a person doing anything. An hour is the outside of a plausible
 * restructure. An agent that needs longer says so again, which is a claim it
 * has to still be alive to make.
 *
 * A claim asking for more is shortened rather than refused: the request was
 * about the work, not about the display, and a refusal would leave the agent
 * unclaimed and drawing anyway.
 */
const CLAIM_MAX_MS = 60 * 60_000;

/**
 * How long a claimed board's lease runs between renewals.
 *
 * Deliberately the same lease as unknown other hold: what makes a claim long is
 * that the canvas keeps renewing it, not that it is written down for longer. A
 * long lease with no renewal would mean a canvas that died mid-claim costs the
 * vault the whole claim, which is the failure the lease exists to prevent
 * arriving on a bigger scale.
 *
 * So it is a name rather than a number, kept separate because the reason for
 * the value differs: LOCK_LEASE_MS has to clear a person's trailing idle
 * report plus its write, and this has to clear a renewal interval. Both are
 * satisfied by the same three seconds today, and the two would be tuned for
 * different reasons.
 */
const CLAIM_LEASE_MS = LOCK_LEASE_MS;

/**
 * How often a canvas looks at the lock files of the boards on its screen.
 *
 * The lock is a broadcast as well as a guard, and the broadcast reaches one
 * canvas: taking a board is news the canvas that did it can send, and a second
 * canvas over the same vault has nothing to tell it because a file does not
 * call anybody. Excluded correctly, told late. ADR 0016 left the poll undone
 * for the per-write hold, where being wrong costs milliseconds, and named the
 * long claim as what makes it worth paying for — a pane on the second canvas
 * would otherwise let somebody draw into a board an agent has had for minutes.
 *
 * One renewal interval, so a pane learns about a claim about as fast as the
 * claim's own lease moves. It costs one small file read per board on screen per
 * second, and only while a browser is connected: with nothing rendering, there
 * is no pane to be wrong.
 */
const LOCK_WATCH_MS = LOCK_RENEW_MS;

/**
 * How long an agent's unclaimed write stays on every pane's activity list.
 *
 * A claim is activity for as long as it stands. A lone write is over in the
 * time it takes to land, and an entry that vanished with the lease would be
 * gone before the eye reached the navigator, so the entry outlives the write
 * by this much (ADR 0022: every pane shows in real time which board an agent
 * is editing, watched or not).
 *
 * Pulls against staleness: the list says "an agent is here" about a board
 * nobody is touching any more. Eight seconds is long enough to read a `doing`
 * line and glance at the board it names, and short enough that a burst of
 * unclaimed writes reads as one visit rather than a board that never comes
 * free. Each write restarts it, so continuous work never flickers.
 */
const ACTIVITY_LINGER_MS = 8000;

export {
	ACTIVITY_LINGER_MS,
	CLAIM_DEFAULT_MS,
	CLAIM_LEASE_MS,
	CLAIM_MAX_MS,
	LOCK_LEASE_MS,
	LOCK_POLL_MS,
	LOCK_RENEW_MS,
	LOCK_STEAL_GUARD_MS,
	LOCK_WAIT_CAP_MS,
	LOCK_WATCH_MS,
};
