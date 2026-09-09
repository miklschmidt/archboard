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
const REPORT_PROGRESS_MS = 400;

/**
 * The trailing idle deadline from the last content edit to the final report.
 * It restarts on every content edit and stays below DEFAULT_SETTLE_MS so the
 * change feed can fold the final write into the same observed human act. It is
 * deliberately twice REPORT_PROGRESS_MS: continuous work makes progress at
 * 400 ms, while a brief pause does not immediately manufacture another tail.
 */
const REPORT_IDLE_SETTLE_MS = 800;

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
const REPORT_RETRY_MS = 2000;

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
const SELECTION_DEBOUNCE_MS = 150;

/**
 * How long a pane waits before dialling the socket again after it drops.
 *
 * It is also the grace before a pane reads a dropped socket as anything at
 * all. A pane stays editable through a socket blip (ADR 0022, TASK-153): lock
 * state is broadcast over this socket, but a pane that cannot hear it for a
 * moment does not assume the board is held, because a person refused their
 * own edit for a network hiccup is the wall stopping for no reason they can
 * see. Only CONTACT_LOST_MS below puts the pane in view mode. It is
 * deliberately unrelated to REPORT_PROGRESS_MS: change reports go by HTTP and
 * are not gated on the socket, so a dropped socket must not also stop a
 * user's edits reaching the server.
 */
const SOCKET_RECONNECT_MS = 3000;

/**
 * How long a pane goes without the server before it treats contact as lost
 * and shows the board in view mode.
 *
 * Two redial intervals, so one failed redial is a blip and a second is loss.
 * A redial that succeeds inside the first interval never shows view mode for
 * a frame, and a pane that cannot hear lock broadcasts for longer than that
 * stops accepting content edits, since it can no longer say whether an agent
 * has claimed the board (ADR 0022). Pan and zoom keep working throughout.
 */
const CONTACT_LOST_MS = 2 * SOCKET_RECONNECT_MS;

// ── What a pane looks like from outside ───────────────────────────────────

/**
 * How long the pane waits before reporting where it sits and what of its board
 * is on screen.
 *
 * It changes on every scroll and zoom, and it is only sent when it has
 * actually changed. An agent must be able to read it every turn, which it can
 * only afford if the browser is not posting it continuously.
 */
const PANE_DEBOUNCE_MS = 300;

/**
 * How long the server waits for the panes to say where they ended up, after
 * asking the browser to split or close one.
 *
 * This is a cap, not a delay. The wait ends as soon as the panes the layout
 * change moved have re-reported; a pane it did not touch is not waited on
 * (TASK-153). It exists because a pane that has just been mounted, or just
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
const PANE_SETTLE_CAP_MS = 1500;

/**
 * How long the server waits for the browser to change its layout at all.
 *
 * The acknowledgement is the pane appearing in the registry or its socket
 * closing, never a promise from the shell, because a registration is the only
 * evidence anywhere that a pane exists. This is the outer bound on that, and
 * it is generous because failing it means telling a user their split did not
 * happen when it may only have been slow.
 */
const PANE_LAYOUT_TIMEOUT_MS = 10_000;

// ── What the browser keeps of the server's answers (TASK-167) ─────────────
//
// Three durations, one cache. The listing is small and every event that can
// change it invalidates it by name, so its window is only the floor under a
// burst of them — and it is the one thing re-read when the tab comes back to
// the foreground, since nothing announces that the vault gained a note. A
// preview is a whole scene plus an export, so it is staler on purpose; a board
// a pane holds is drawn from that pane and never read here at all. Collection
// pulls against the tab's memory rather than the server: it is what lets a
// board come back showing its last preview instead of an empty card.

const BOARD_LISTING_STALE_MS = 30_000;
const BOARD_PREVIEW_STALE_MS = 60_000;
const BOARD_CACHE_GC_MS = 5 * 60_000;

/** Outer cap for any browser-owned export request. The wait ends on correlation, not delay. */
const BROWSER_EXPORT_TIMEOUT_MS = 30_000;

/** Delay after refreshing one pane before asking it to capture the presented board. */
const BROWSER_CAPTURE_DISPATCH_MS = 800;

/** Window in which capture results compete; the largest successful payload wins. */
const BROWSER_CAPTURE_COLLECTION_MS = 3000;

/** Outer cap for one correlated browser viewport request. */
const BROWSER_VIEWPORT_SETTLEMENT_MS = 10_000;

// ── Server-owned board rendering (ADR 0020) ──────────────────────────────

/**
 * Bound for one serialized PNG, SVG, findings batch, or Mermaid job in the
 * private renderer. This is intentionally half the proof harness's 20-second
 * fault deadline. Product work renders one immutable request and reports its
 * named page phase when this bound expires.
 */
const BOARD_RENDER_JOB_TIMEOUT_MS = 10_000;

/**
 * Bound for the private Chromium control port, target, and renderer page to
 * become ready. Startup is lazy, so this delay belongs to the first Board
 * render rather than to every canvas launch. A five-second page deadline
 * expired under a half-CPU quota; ten seconds completed three cold starts
 * with valid PNG/SVG output (TASK-162).
 */
const BOARD_RENDER_STARTUP_TIMEOUT_MS = 10_000;

/**
 * Shared deadline for renderer group termination, output-pipe settlement,
 * profile removal, and fixture-server closure. Cleanup proves the dedicated
 * process group absent before deleting its private profile.
 */
const BOARD_RENDER_CLEANUP_MS = 5000;

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
const DEFAULT_SETTLE_MS = 1200;

/**
 * The longest the feed will hold an unsettled board before emitting anyway.
 *
 * Overridable with ARCHBOARD_SETTLE_MAX_MS. Without it, somebody drawing
 * continuously for a minute would keep restarting the settle timer and the
 * agent would hear nothing for that minute. This caps that at five settle
 * windows, so a long stretch of continuous work still reports every few
 * seconds.
 */
const DEFAULT_SETTLE_MAX_MS = 6000;

// ── Canvas application shutdown (ADR 0021) ────────────────────────────────

/**
 * Longest a stop attempt waits for admitted request parsing and explicit
 * mutation work to settle before refusing teardown and restoring admission.
 *
 * It stays below the CLI's five-second stop observation window, so a stuck
 * request produces a healthy, inspectable refusal rather than looking like a
 * dead server. It is longer than REPORT_IDLE_SETTLE_MS, allowing an ordinary
 * human edit and trailing report to drain without turning stop into a refusal.
 * A disconnected board-lock waiter does not spend this budget: its request
 * signal cancels the LOCK_POLL_MS wait immediately.
 */
const CANVAS_MUTATION_DRAIN_TIMEOUT_MS = 1000;

/**
 * Grace for existing HTTP connections after write admission closes. It stays
 * below the CLI health probe so a stuck keep-alive is forced closed before the
 * next stop observation. WebSocket clients close in their own earlier owner.
 */
const CANVAS_HTTP_STOP_GRACE_MS = 250;

// ── Git checkout inspection ───────────────────────────────────────────────

/**
 * Outer bound for one Git identity probe while an operation captures its
 * checkout snapshot. Snapshot work runs before a board lock or synchronous
 * note write, so this never extends either critical section. It is longer
 * than the canvas mutation-drain refusal window: stop may refuse and keep the
 * application intact while a slow probe is still cancellable by its request
 * or application owner.
 */
const GIT_COMMAND_TIMEOUT_MS = 5000;

/**
 * Grace after Git termination for the detached group, leader and both output
 * pipes to disappear. It matches the mutation-drain window so failed cleanup
 * is diagnosed promptly rather than hiding behind the command timeout.
 */
const GIT_PROCESS_GROUP_CLEANUP_MS = CANVAS_MUTATION_DRAIN_TIMEOUT_MS;

/** Observation cadence while proving a killed process group is absent. */
const PROCESS_GROUP_OBSERVATION_POLL_MS = 10;

/** Git process cleanup uses the shared process-group observation cadence. */
const GIT_PROCESS_GROUP_POLL_MS = PROCESS_GROUP_OBSERVATION_POLL_MS;

/**
 * Outer grace before an interrupted CLI restores the signal's default action.
 * Git may spend one cleanup grace terminating and cancelling its leader and
 * pipes, then another proving the detached group is absent. A third grace is
 * reserved for that settled failure to cross the command runner before the CLI
 * re-signals itself; the outer owner must never pre-empt either inner proof.
 */
const CLI_INTERRUPT_CLEANUP_MS = 3 * GIT_PROCESS_GROUP_CLEANUP_MS;

// ── Codex workbench policy (ADR 0019) ─────────────────────────────────────
//
// These are authored policy values, not consumer defaults. Their expiry
// classifications matter: an expiry bounds a retry, lease, readiness,
// freshness, approval, recovery, or shutdown operation, but never proves that
// a remote mutation failed. Consumers must use these names and must not add a
// local duration or an override hook.
//
// Restart delay doubles after each failed child attempt, caps at the maximum,
// and resets only after one account-ready session. Shutdown is ordered around
// the child lifecycle: stop realtime first, settle local waiters, close stdin,
// send TERM, then send KILL at the grace bound. The full sequence stays within
// the composed shutdown cap.

/** Retry-delay classification. Pulls against the first restart attempt. */
const CODEX_PROCESS_RESTART_BASE_MS = 1000;

/** Retry-delay cap classification. Pulls against request settlement and the backoff ceiling. */
const CODEX_PROCESS_RESTART_MAX_MS = 30_000;

/** Uncertainty-bound classification. Pulls against a lost non-idempotent response before `outcome_unknown`. */
const CODEX_REQUEST_SETTLEMENT_MS = 30_000;

/** Browser-command lease classification. Pulls against the public browser wait contract and approval expiry. */
const CODEX_BROWSER_COMMAND_LEASE_MS = 150_000;

/** Visual-approval expiry classification. Pulls against the browser-command lease. */
const CODEX_APPROVAL_EXPIRY_MS = 90_000;

/** Spoken-approval gate expiry classification. Pulls against visual approval expiry. */
const CODEX_SPOKEN_GATE_EXPIRY_MS = 60_000;

/** Semantic-freshness expiry classification. Pulls against realtime recovery. */
const CODEX_SEMANTIC_FRESHNESS_MS = 30_000;

/** Realtime-readiness timeout classification. Pulls against permission-independent SDP/start readiness. */
const CODEX_REALTIME_START_MS = 15_000;

/** Realtime-stop timeout classification. Pulls against TERM grace so realtime stops first. */
const CODEX_REALTIME_STOP_MS = 3000;

/** Realtime-recovery window classification. Pulls against semantic freshness while reconnecting. */
const CODEX_REALTIME_RECOVERY_MS = 45_000;

/** TERM grace classification. Pulls against realtime stop before TERM-to-KILL escalation. */
const CODEX_TERM_GRACE_MS = 5000;

/** Composed-shutdown cap classification. Pulls against realtime stop plus TERM grace. */
const CODEX_COMPOSED_SHUTDOWN_MS = 10_000;

/** Public canvas readiness classification. Pulls against mandatory Codex startup readiness. */
const CANVAS_STARTUP_READINESS_MS = 8000;

/**
 * Bounds dynamic wait detection latency against app-server thread status
 * reads. Request uncertainty must contain a whole number of polls so the last
 * observation cannot cross the settlement boundary.
 */
const CODEX_WAIT_TARGET_POLL_MS = 250;

/**
 * Read-amplification floor classification. Pulls against the wait-target poll
 * below and request settlement above.
 *
 * Serving a browser snapshot request re-reads the authoritative workhorse
 * queue, which is a paginated app-server call. A client is free to ask for a
 * snapshot as often as it likes, so the host coalesces concurrent re-reads and
 * will not start a new one inside this floor. It sits at or above one
 * wait-target poll, because a browser must not out-run the cadence the host
 * observes thread state at, and far below request settlement, so a person's
 * refresh still reads as immediate.
 */
const CODEX_QUEUE_REREAD_FLOOR_MS = 1000;

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

// ── Canvas subprocesses owned by checks (TASK-086) ───────────────────────

export {
	REPORT_PROGRESS_MS,
	REPORT_IDLE_SETTLE_MS,
	REPORT_RETRY_MS,
	SELECTION_DEBOUNCE_MS,
	SOCKET_RECONNECT_MS,
	CONTACT_LOST_MS,
	PANE_DEBOUNCE_MS,
	PANE_SETTLE_CAP_MS,
	PANE_LAYOUT_TIMEOUT_MS,
	BOARD_LISTING_STALE_MS,
	BOARD_PREVIEW_STALE_MS,
	BOARD_CACHE_GC_MS,
	BROWSER_EXPORT_TIMEOUT_MS,
	BROWSER_CAPTURE_DISPATCH_MS,
	BROWSER_CAPTURE_COLLECTION_MS,
	BROWSER_VIEWPORT_SETTLEMENT_MS,
	BOARD_RENDER_JOB_TIMEOUT_MS,
	BOARD_RENDER_STARTUP_TIMEOUT_MS,
	BOARD_RENDER_CLEANUP_MS,
	DEFAULT_SETTLE_MS,
	DEFAULT_SETTLE_MAX_MS,
	CANVAS_MUTATION_DRAIN_TIMEOUT_MS,
	CANVAS_HTTP_STOP_GRACE_MS,
	GIT_COMMAND_TIMEOUT_MS,
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
	PROCESS_GROUP_OBSERVATION_POLL_MS,
	CLI_INTERRUPT_CLEANUP_MS,
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_PROCESS_RESTART_MAX_MS,
	CODEX_REQUEST_SETTLEMENT_MS,
	CODEX_BROWSER_COMMAND_LEASE_MS,
	CODEX_APPROVAL_EXPIRY_MS,
	CODEX_SPOKEN_GATE_EXPIRY_MS,
	CODEX_SEMANTIC_FRESHNESS_MS,
	CODEX_REALTIME_START_MS,
	CODEX_REALTIME_STOP_MS,
	CODEX_REALTIME_RECOVERY_MS,
	CODEX_TERM_GRACE_MS,
	CODEX_COMPOSED_SHUTDOWN_MS,
	CANVAS_STARTUP_READINESS_MS,
	CODEX_WAIT_TARGET_POLL_MS,
	CODEX_QUEUE_REREAD_FLOOR_MS,
	LOCK_LEASE_MS,
	LOCK_RENEW_MS,
	LOCK_WAIT_CAP_MS,
	LOCK_POLL_MS,
	LOCK_STEAL_GUARD_MS,
	CLAIM_DEFAULT_MS,
	CLAIM_MAX_MS,
	CLAIM_LEASE_MS,
	LOCK_WATCH_MS,
	ACTIVITY_LINGER_MS,
};
