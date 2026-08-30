// Every duration that decides when a change is flushed, when a board is
// considered still, and how long anybody waits for either.
//
// They used to sit next to the code that consumed them, five in the pane's
// session hook, two in the change feed, two in the server's pane routes and
// two in the injection config. Read one at a time they all look independent,
// and they are not. ADR 0016 is where that stopped being tolerable:
//
//     A person's edit has two flush deadlines and a leading-edge hold. The
//     fixed progress deadline bounds how long continuous work stays only in
//     the pane; the longer idle deadline produces the final settled write.
//     Shortening either writes to the vault more often. Lengthening either
//     extends how long the human hold delays an agent.
//
// So they live here, with what pulls against what written beside them. Nothing
// in this file has behaviour. It is numbers and the reasons for them, and the
// reasons are the point: the next person to halve one of these should not have
// to discover by accident what else they halved.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read. `src/runtime/engine/labels`, `src/shared/appearance` and
// `src/runtime/engine/expand-elements` cross the same boundary the same way.

// ── A user's edits reaching the server ────────────────────────────────────

/**
 * The fixed deadline from the first unsent content change to a progress
 * report when later changes show work is continuing. Later changes do not
 * restart it. If the next change arrives after this deadline but before idle,
 * the elapsed deadline makes that progress immediately due; without a next
 * change, the final dirty state waits for the idle deadline.
 *
 * A user edit should be on the server before they finish saying what they
 * did. The report is a delta, not the scene, so this can be short without
 * being expensive.
 *
 * `POST /api/boards/hold` goes out on the leading edge and renews every
 * LOCK_RENEW_MS while content is pending. This deadline both gives a long drag
 * periodic durability and caps how long hold acquisition waits out an
 * already-started agent write. At most one report is in flight; another due
 * deadline records one queued latest delivery rather than fanning out.
 */
export const REPORT_PROGRESS_MS = 400;

/**
 * The trailing idle deadline from the last content edit to the final report.
 * It restarts on every content edit and stays below DEFAULT_SETTLE_MS so the
 * change feed can fold the final write into the same observed human act. It is
 * deliberately twice REPORT_PROGRESS_MS: continuous work makes progress at
 * 400 ms, while a brief pause does not immediately manufacture another tail.
 */
export const REPORT_IDLE_SETTLE_MS = 800;

/**
 * How long the pane waits before retrying a report the server refused or never
 * answered.
 *
 * The baseline is untouched by a failure, so the retry recomputes the very
 * same delta and nothing is lost except promptness. It is longer than a settle
 * window, which means a report that only lands on the retry is a second event
 * in the feed rather than part of the first. That is the right way round: the
 * agent hearing about one drag twice costs it a sentence, and a retry inside
 * the settle window would mean hammering a server that is already failing.
 */
export const REPORT_RETRY_MS = 2000;

/**
 * How long the pane waits before publishing a changed selection.
 *
 * Selection is high-frequency and cheap, ids only, so it gets its own and much
 * shorter debounce. 150 ms coalesces a lasso drag into one POST while still
 * feeling immediate to somebody talking to an agent about "these boxes".
 *
 * Selection and changes travel by different routes, so these two numbers are
 * what orders them, and 150 against 400 orders them the useful way round: an
 * agent hears which boxes were picked up before it hears what happened to
 * them. Raising this past REPORT_PROGRESS_MS reverses that, and the symptom
 * would be an agent describing a move against the previous selection.
 */
export const SELECTION_DEBOUNCE_MS = 150;

/**
 * How long a pane waits before dialling the socket again after it drops.
 *
 * Gathered here rather than left inline because ADR 0016 gives it a second
 * job it does not have yet. Lock state is broadcast over this socket, and a
 * pane that cannot hear the broadcast has to assume the board is held rather
 * than that it is free. So this is also the longest a pane can refuse a user's
 * edit after a brief disconnect. It is deliberately unrelated to
 * REPORT_PROGRESS_MS: change
 * reports go by HTTP and are not gated on the socket, so a dropped socket must
 * not also stop a user's edits reaching the server.
 */
export const SOCKET_RECONNECT_MS = 3000;

// ── What a pane looks like from outside ───────────────────────────────────

/**
 * How long the pane waits before reporting where it sits and what of its board
 * is on screen.
 *
 * It changes on every scroll and zoom, and it is only sent when it has
 * actually changed. An agent must be able to read it every turn, which it can
 * only afford if the browser is not posting it continuously.
 */
export const PANE_DEBOUNCE_MS = 300;

/**
 * How long the server waits for the panes to say where they ended up, after
 * asking the browser to split or close one.
 *
 * This is a cap, not a delay. The wait ends as soon as every pane has
 * re-reported. It exists because a pane that has just been mounted, or just
 * been squeezed into half the width, reports its new rectangle a beat later,
 * and answering before that arrives means answering out of stale geometry.
 * That is how a plain left/right split once came back described as "row 2,
 * column 2". Observed on the first real browser run, not guessed.
 *
 * The beat it is waiting out is PANE_DEBOUNCE_MS, which is the coupling worth
 * knowing about: this must stay comfortably above it, or the cap expires while
 * the browser is still sitting on the report that would have ended the wait.
 * 300 against 1500 leaves room for the round trip and a slow frame.
 */
export const PANE_SETTLE_CAP_MS = 1500;

/**
 * How long the server waits for the browser to change its layout at all.
 *
 * The acknowledgement is the pane appearing in the registry or its socket
 * closing, never a promise from the shell, because a registration is the only
 * evidence anywhere that a pane exists. This is the outer bound on that, and
 * it is generous because failing it means telling a user their split did not
 * happen when it may only have been slow.
 */
export const PANE_LAYOUT_TIMEOUT_MS = 10000;

/** Outer cap for any browser-owned export request. The wait ends on correlation, not delay. */
export const BROWSER_EXPORT_TIMEOUT_MS = 30000;

// ── When a board is considered still ──────────────────────────────────────

/**
 * How long the change feed waits for a board to stop moving before diffing it
 * against the last state anybody was told about.
 *
 * Overridable with ARCHBOARD_SETTLE_MS. Three checks set it, two down to a few
 * hundred milliseconds so they are not mostly sleep, and one up to a minute so
 * that only the settles it asks for explicitly ever fire.
 *
 * This is the number the ADR 0016 tension is about, seen from the far end. It
 * has to be longer than REPORT_IDLE_SETTLE_MS, because that deadline sets the
 * closest together two trailing flushes from separate stretches can arrive. A
 * settle window shorter than the trailing idle deadline would make every
 * flush its own event and the coalescing would do nothing. 800 against 1200
 * leaves room for a flush, its round trip and the next flush inside one window,
 * which is what turns
 * "they rearranged that corner" into one thing the agent is told rather than
 * three.
 */
export const DEFAULT_SETTLE_MS = 1200;

/**
 * The longest the feed will hold an unsettled board before emitting anyway.
 *
 * Overridable with ARCHBOARD_SETTLE_MAX_MS. Without it, somebody drawing
 * continuously for a minute would keep restarting the settle timer and the
 * agent would hear nothing for that minute. This caps that at five settle
 * windows, so a long stretch of continuous work still reports every few
 * seconds.
 */
export const DEFAULT_SETTLE_MAX_MS = 6000;

// ── Pushing change events into a live thread ──────────────────────────────

/**
 * How long injection waits after a change event before pushing it into the
 * thread. Overridable with ARCHBOARD_INJECT_DEBOUNCE_MS.
 *
 * Stacked on top of the settle window rather than replacing it: the feed has
 * already coalesced the movement, and this coalesces the events. A person
 * rearranging three boxes in a row produces three settled events and should
 * cost the agent one interruption.
 */
export const DEFAULT_INJECT_DEBOUNCE_MS = 4000;

/**
 * The floor on how often the thread may be interrupted, whatever the board is
 * doing. Overridable with ARCHBOARD_INJECT_MIN_INTERVAL_MS.
 *
 * The debounce coalesces a burst; this bounds a steady stream. Somebody
 * working continuously on the board generates events forever, and an agent
 * being told about them every four seconds cannot get anything else done.
 */
export const DEFAULT_INJECT_MIN_INTERVAL_MS = 10_000;

// ── One writer at a time (ADR 0016) ───────────────────────────────────────
//
// `src/runtime/engine/board-lock.ts` is the only thing that reads these. It was built
// against them rather than around them, and the three it added since — the
// poll, the steal guard and the free linger — are here for the reason the
// first three were: a number that governs the lock and lives next to the lock
// is a number the next person tunes without seeing what it pulls against.

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
export const LOCK_LEASE_MS = 3000;

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
export const LOCK_RENEW_MS = 1000;

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
export const LOCK_WAIT_CAP_MS = 5000;

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
export const LOCK_POLL_MS = 50;

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
export const LOCK_STEAL_GUARD_MS = 25;

/**
 * How long the panes are left believing a board is still held after it was
 * released.
 *
 * The lock itself is released immediately — this delays only the news, and
 * only the half of the news that opens a board back up. A release that is
 * followed by another hold inside this window is never broadcast at all.
 *
 * It exists because an agent's write is still a fan-out in places (TASK-083:
 * promote, demote and a multi-id delete are one write per element), so a
 * single agent action can take and release the lock a dozen times in as many
 * milliseconds. Broadcast raw, that is a dozen round trips of every pane
 * flicking in and out of read-only while the user edits.
 *
 * A linger errs toward saying a free board is held, which is the direction
 * this whole mechanism errs in (ADR 0016: a pane that cannot be told must
 * assume the board is held). One renewal interval is long enough to swallow a
 * fan-out and short enough that a user never notices a board they can already
 * write to.
 */
export const LOCK_FREE_LINGER_MS = LOCK_RENEW_MS;

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
export const CLAIM_DEFAULT_MS = 10 * 60_000;

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
export const CLAIM_MAX_MS = 60 * 60_000;

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
export const CLAIM_LEASE_MS = LOCK_LEASE_MS;

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
export const LOCK_WATCH_MS = LOCK_RENEW_MS;

/** Bun lifecycle failure thresholds—not hang ceilings/SLAs—clear hosted sweep 5.274s, totality 5,003.69ms (~3x at 15s), and terminal 27.094s; package +10_000 ms covers below-limit/setup. */
export const TEST_BOARD_INSPECTION_SWEEP_CASE_TIMEOUT_MS = 15_000;
export const TEST_BOARD_INSPECTION_TOTALITY_CASE_TIMEOUT_MS = 15_000;
export const TEST_BOARD_INSPECTION_TERMINAL_CASE_TIMEOUT_MS = 40_000;
export const TEST_BOARD_INSPECTION_PACKAGE_CASE_TIMEOUT_MS =
	2 * TEST_BOARD_INSPECTION_TERMINAL_CASE_TIMEOUT_MS + 10_000;
// ── Canvas subprocesses owned by checks (TASK-086) ───────────────────────

/** Canvas identity startup stays below TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS with bounded shutdown room. */
export const TEST_CANVAS_STARTUP_TIMEOUT_MS = 15_000;

/**
 * How long one health request may wait inside the startup cap.
 *
 * It is ten TEST_CANVAS_HEALTH_POLL_MS intervals. A dead listener therefore
 * costs at most half a second per attempt, while a connection refusal returns
 * immediately and follows the shorter poll cadence.
 */
export const TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS = 500;

/**
 * How long startup waits between refused health connections.
 *
 * This pulls against the server's ordinary sub-second startup. Shorter would
 * spin on a closed port; longer would make identity verification noticeably
 * lag behind a child that is already listening.
 */
export const TEST_CANVAS_HEALTH_POLL_MS = 50;

/**
 * How long graceful shutdown gets before the owner escalates its exact child
 * to SIGKILL, and how long that forced exit gets to be observed.
 *
 * Two of these intervals plus TEST_CANVAS_STARTUP_TIMEOUT_MS must fit inside
 * TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS so the parent proof outlives the complete
 * child-owned cleanup path.
 */
export const TEST_CANVAS_SHUTDOWN_TIMEOUT_MS = 1_000;

/**
 * Outer threshold for one lifecycle proof subprocess, from spawn through cleanup.
 *
 * It clears startup, owner shutdown, and post-`canvas stop` PID observation
 * beyond the server's 2,000 ms forced-exit fallback. A stuck proof therefore
 * fails with its PID and mode instead of hanging the whole board suite.
 */
export const TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS = 20_000;

/** One shutdown interval keeps concurrent children live until every verified base is reported. */
export const TEST_CANVAS_CONCURRENT_RELEASE_DELAY_MS = TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;

/**
 * Two shutdown intervals beyond TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS let the Bun
 * case receive rejection, assert it, and dispose a retained generation.
 */
export const TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS = 2 * TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;

/**
 * Cap for the post-cleanup health probe.
 *
 * Five health-poll intervals are enough to distinguish a listener that still
 * answers from a refused connection without making four cleanup cases cost a
 * second each when a platform delays refusal.
 */
export const TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS = 250;

/**
 * Delay between the early-death fixture sending response headers and exiting.
 *
 * Half one health-poll interval lets `fetch` expose the response before the
 * body is cut off, while the public liveness check still observes the exit
 * inside the same TEST_CANVAS_HEALTH_POLL_MS window.
 */
export const TEST_CANVAS_EARLY_DEATH_DELAY_MS = 25;

/**
 * How long a synthetic pane lets the server's initial socket frames arrive
 * before registering the pane it stands in for.
 *
 * This clears one TEST_PANE_MESSAGE_POLL_MS interval plus ordinary loopback
 * delivery. It is mechanics only: owner tests wait on named messages when a
 * message itself is the contract.
 */
export const TEST_PANE_SOCKET_SETTLE_MS = 80;

/**
 * How often synthetic pane mechanics inspect their captured socket frames.
 *
 * Four polls fit inside TEST_PANE_SOCKET_SETTLE_MS. The interval stays short
 * enough to observe an already-delivered loopback frame without turning the
 * wait into a busy spin.
 */
export const TEST_PANE_MESSAGE_POLL_MS = 20;

/**
 * Outer cap for a synthetic pane waiting on one named socket frame.
 *
 * This is longer than PANE_SETTLE_CAP_MS, so a server waiting for pane
 * geometry gets its full cap before the test declares the expected frame
 * missing. It remains far below BROWSER_EXPORT_TIMEOUT_MS because these
 * panes acknowledge callbacks directly and never render.
 */
export const TEST_PANE_MESSAGE_TIMEOUT_MS = 2_000;
/** Four LOCK_WATCH_MS sweeps cover a timestamp boundary and board_note delivery. */
export const TEST_NOTE_WATCH_MESSAGE_TIMEOUT_MS = 4 * LOCK_WATCH_MS;
/**
 * LOCK_POLL_MS observes a delivered note-watch frame without polling faster
 * than the lock-file machinery that carries the notification.
 */
export const TEST_NOTE_WATCH_MESSAGE_POLL_MS = LOCK_POLL_MS;
/** One LOCK_WATCH_MS bounds the board_note clearing frame after reload. */
export const TEST_NOTE_WATCH_CLEAR_TIMEOUT_MS = LOCK_WATCH_MS;
/** Ordinary browser commands stay at 30s; the 10k-element initial render gets three windows, finite and not an SLA. */
export const TEST_BROWSER_COMMAND_TIMEOUT_MS = BROWSER_EXPORT_TIMEOUT_MS;
export const TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS = 3 * TEST_BROWSER_COMMAND_TIMEOUT_MS;
/** Matches the existing loopback and lock polling cadence without busy-waiting. */
export const TEST_BROWSER_POLL_MS = LOCK_POLL_MS;
/** Extends the negative pane window past one debounce without reaching its settle cap. */
export const TEST_PANE_DEBOUNCE_MARGIN_MS = 2 * TEST_BROWSER_POLL_MS;
/** Polls fake-opener lifecycle evidence within its 2s operation bound. */
export const TEST_OPENER_LIFECYCLE = { pollMs: 20, timeoutMs: 2_000 } as const;
/** Aggregate Bun case, not an operation cap/SLA: 20s avoids the hosted 5s cancellation path while keeping a finite bound. */
export const TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS = 20_000;
/** Aggregate Bun case, not an operation cap/SLA: 20s clears hosted 5,034ms and stressed 14,815.78ms. */
export const TEST_CODE_TARGET_PRESENTATION_CASE_TIMEOUT_MS = 20_000;
