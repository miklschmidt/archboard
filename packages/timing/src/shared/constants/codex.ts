// Codex workbench policy.
//
// These are authored policy values, not consumer defaults. Their expiry
// classifications matter: an expiry bounds a retry, lease, readiness,
// freshness, approval, recovery, or shutdown operation, but never proves that
// a remote mutation failed. Consumers must use these names and must not add a
// local duration or an override hook. Their reviewed values are pinned by
// `tests/shared/constants/codex-workbench-policy.test.ts`.
//
// Shutdown is ordered around the child lifecycle: stop realtime, settle local
// waiters, close stdin, wait for EOF, TERM, then freeze and KILL the group, all
// within the composed cap.

import { backoff, bound, delay, handed, polled, span } from "#shared/constants/uses.ts";

/** `codex.composedShutdown`, named once so that its other uses last as long. */
const COMPOSED_SHUTDOWN_MS = 10_000;

/** `codex.termGrace`, named once so that a failed server start's cleanup gets the same grace. */
const TERM_GRACE_MS = 5000;

/** `codex.dynamicWait`, named once so that its looks last as long. */
const DYNAMIC_WAIT_MS = 120_000;

/** `codex.requestSettlement`, named once so that the child's readiness can wait as long. */
const REQUEST_SETTLEMENT_MS = 30_000;

/** The `codex app-server` child: its readiness, its restart backoff and its ordered shutdown. */
const CODEX_PROCESS = {
	/**
	 * Restart delay: it doubles after each failed child attempt from its first second, caps at the
	 * maximum, and resets only after one account-ready session. Its cap pulls against request
	 * settlement and the backoff ceiling.
	 */
	"codex.restart": backoff(1000, 30_000),
	/** How long a spawned child may take to acknowledge typed readiness: one request settlement. */
	"codex.readiness": delay(
		REQUEST_SETTLEMENT_MS,
		"the Codex app-server to acknowledge typed readiness",
	),
	/**
	 * Stdin EOF grace lets the child consume drained frames before TERM and ends on closure.
	 * Realtime stop, EOF and TERM leave one second of the composed cap for group absence proof.
	 */
	"codex.stdinEofGrace": bound(1000, "the Codex child to exit on stdin EOF"),
	/** TERM grace classification. Pulls against realtime stop before TERM-to-KILL escalation. */
	"codex.termGrace": polled(TERM_GRACE_MS, "a TERMed Codex process group to exit"),
	/**
	 * How long KILL waits for the TERMed group to freeze. A group freezes in a few
	 * observation polls, but a member in a killable kernel wait never reads as stopped
	 * and still dies on KILL. Pulls against the absence-proof second the composed
	 * shutdown cap keeps, so a freeze that cannot finish leaves time to prove the
	 * killed group gone.
	 */
	"codex.groupFreeze": polled(500, "a TERMed Codex process group to freeze"),
	/** How long a killed group may take to disappear: the rest of the composed cap. */
	"codex.killDrain": polled(COMPOSED_SHUTDOWN_MS, "a killed Codex process group to disappear"),
	/** Composed-shutdown cap classification. Pulls against realtime stop, stdin EOF grace, and TERM grace. */
	"codex.composedShutdown": bound(
		COMPOSED_SHUTDOWN_MS,
		"the Codex child and its process group to shut down",
	),
	/** How long the transport waits for the child to close once it shut down, before it aborts. */
	"codex.transportShutdown": delay(COMPOSED_SHUTDOWN_MS),
	/** The composed cap, handed to the cleanup of a failed server start. */
	"codex.startupCleanup": handed(COMPOSED_SHUTDOWN_MS),
	/** The TERM grace, handed to the cleanup of a failed server start. */
	"codex.startupGrace": handed(TERM_GRACE_MS),
};

/** Requests to the app-server session, and how often its thread state is read. */
const CODEX_SESSION = {
	/**
	 * How long an explanation waits for the turn of a message that an idle thread took from the
	 * queue by itself, before it tells the reader to look at the conversation.
	 */
	"codex.explanationTurnStart": bound(15_000, "Codex to start the turn of a queued message"),
	/** How often an answer that Codex writes reaches the panel: a reader sees it arrive in steps. */
	"codex.explanationText": delay(150),
	/**
	 * Uncertainty-bound classification. Pulls against a lost non-idempotent response before
	 * `outcome_unknown`. Each request, and the coordinator's settings notification, waits this long.
	 */
	"codex.requestSettlement": delay(REQUEST_SETTLEMENT_MS, "Codex to answer a request"),
	/** The request settlement, handed to the bounded `codex --version` proof. */
	"codex.versionProof": handed(REQUEST_SETTLEMENT_MS),
	/**
	 * The longest dynamic wait an agent may ask for on the threads it waits on; each wait names
	 * its own length up to this. Pulls against the browser-command lease, which outlasts it.
	 */
	"codex.dynamicWait": bound(DYNAMIC_WAIT_MS, "the awaited threads to report"),
	/** The looks of a dynamic wait at the thread status, inside its bound. */
	"codex.dynamicWaitLook": polled(DYNAMIC_WAIT_MS, "the awaited threads to report"),
	/**
	 * Read-amplification floor classification. Pulls against request settlement above.
	 *
	 * Serving a browser snapshot request re-reads the authoritative workhorse
	 * queue, which is a paginated app-server call. A client is free to ask for a
	 * snapshot as often as it likes, so the server coalesces concurrent re-reads and
	 * will not start a new one inside this floor. It sits far below request settlement,
	 * so a person's refresh still reads as immediate.
	 */
	"codex.queueRereadFloor": span(1000),
	/**
	 * How long a workhorse stop observes its work tree before it reports what still runs as a
	 * partial or unconfirmed stop. Pulls against the coordinator's tool call, which waits for the
	 * stop while the person waits for the voice to answer, and against an interrupt's settlement,
	 * which Codex acknowledges before the turn reports that it ended.
	 */
	"codex.workTreeStop": polled(5000, "the workhorse's work tree to stop"),
};

/**
 * The voice: its realtime start, stop, recovery and the freshness it needs, and how soon the
 * browser's voice client opens its socket again.
 */
const CODEX_REALTIME = {
	/** Realtime-readiness timeout classification. Pulls against permission-independent SDP/start readiness. */
	"codex.realtimeStart": span(15_000, "the voice to start"),
	/** Realtime-stop timeout classification. Pulls against TERM grace so realtime stops first. */
	"codex.realtimeStop": handed(3000),
	/** Realtime-recovery window classification. Pulls against context freshness while reconnecting. */
	"codex.realtimeRecovery": span(45_000),
	/** How long an announced context change stays fresh enough to deliver. Pulls against realtime recovery. */
	"codex.contextFreshness": span(30_000),
	/**
	 * How long the voice client waits before opening its socket again after the
	 * socket is lost, and between failed attempts after that. Pulls against the tab
	 * session grace: a reload plus these redials must fit inside it, or the server
	 * ends the conversation before the client is back. It is also the beat of a
	 * retry, so a shorter value would hammer a server that is restarting.
	 */
	"codex.clientReconnect": span(3000),
	/**
	 * How long a browser tab's conversation outlives its last browser socket. Pulls against a
	 * reload plus `codex.clientReconnect` redials, which it must outlast or a reload loses the
	 * conversation, and `codex.approvalExpiry`, which it must stay under so a closed tab's approvals
	 * end as "tab session ended" rather than expiring unanswered.
	 */
	"codex.tabSessionGrace": delay(60_000),
};

/** A browser command an agent leases, and the approvals a person answers. */
const CODEX_APPROVAL = {
	/** Browser-command lease classification. Pulls against the public browser wait contract and approval expiry. */
	"codex.browserCommandLease": span(150_000),
	/** Visual-approval expiry classification. Pulls against the browser-command lease. */
	"codex.approvalExpiry": span(90_000),
	/** Spoken-approval gate expiry classification. Pulls against visual approval expiry. */
	"codex.spokenGate": span(60_000),
};

/** Every duration of the Codex workbench. */
const CODEX = { ...CODEX_PROCESS, ...CODEX_SESSION, ...CODEX_REALTIME, ...CODEX_APPROVAL };

export { CODEX };
