// The anonymous usage records of an installation and their one sender (ADR 0079).

/** How long the server waits on PostHog, and how long a record waits for it. */
const TELEMETRY_MS = Object.freeze({
	/**
	 * Bound for one event post. A slow or blocked network drops the post and the record stays for
	 * the next round, so a firewall never holds the server.
	 */
	send: 5000,
	/**
	 * Cadence of the sender. An error reaches PostHog within this time of the server seeing it, and
	 * a finished day within this time of midnight UTC.
	 */
	round: 5 * 60 * 1000,
	/** A record that no round could send in this time is deleted unsent. */
	keep: 7 * 24 * 60 * 60 * 1000,
	/**
	 * A sender claims a file by renaming it. A claim this old belongs to a sender that died while it
	 * held it, so the file goes back to the queue.
	 */
	staleClaim: 60 * 60 * 1000,
	/** Two agents whose commands come within this time of each other worked at the same time. */
	agentOverlap: 30 * 60 * 1000,
} satisfies Record<string, number>);

export { TELEMETRY_MS };
