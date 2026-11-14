// The voice's own durations: its realtime start, stop and recovery, the approvals a person
// answers, and how long a closed tab's conversation lives on.

/**
 * The voice: its realtime start, stop, recovery and the freshness it needs, and how soon the
 * browser's voice client opens its socket again.
 */
const CODEX_REALTIME_MS = Object.freeze({
	/** Realtime-readiness timeout classification. Pulls against permission-independent SDP/start readiness. */
	start: 15_000,
	/** Realtime-stop timeout classification. Pulls against TERM grace so realtime stops first. */
	stop: 3000,
	/** Realtime-recovery window classification. Pulls against context freshness while reconnecting. */
	recovery: 45_000,
	/** How long an announced context change stays fresh enough to deliver. Pulls against realtime recovery. */
	contextFreshness: 30_000,
	/**
	 * How long the voice client waits before opening its socket again after the
	 * socket is lost, and between failed attempts after that. Pulls against the tab
	 * session grace: a reload plus these redials must fit inside it, or the server
	 * ends the conversation before the client is back. It is also the beat of a
	 * retry, so a shorter value would hammer a server that is restarting.
	 */
	clientReconnect: 3000,
} satisfies Record<string, number>);

/** A browser command an agent leases, and the approvals a person answers. */
const CODEX_APPROVAL_MS = Object.freeze({
	/** Browser-command lease classification. Pulls against the public browser wait contract and approval expiry. */
	browserCommandLease: 150_000,
	/** Visual-approval expiry classification. Pulls against the browser-command lease. */
	expiry: 90_000,
	/** Spoken-approval gate expiry classification. Pulls against visual approval expiry. */
	spokenGate: 60_000,
} satisfies Record<string, number>);

/**
 * How long a browser tab's conversation outlives its last browser socket. Pulls against a
 * reload plus CODEX_REALTIME_MS.clientReconnect redials, which it must outlast or a reload loses the
 * conversation, and CODEX_APPROVAL_MS.expiry, which it must stay under so a closed tab's approvals
 * end as "tab session ended" rather than expiring unanswered.
 */
const TAB_SESSION_GRACE_MS = 60_000;

export { CODEX_APPROVAL_MS, CODEX_REALTIME_MS, TAB_SESSION_GRACE_MS };
