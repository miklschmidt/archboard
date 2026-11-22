// The anonymous usage records of an installation and their one sender (ADR 0079).

import { bound, span, tick } from "#shared/constants/uses.ts";

/** How long the server waits on PostHog, and how long a record waits for it. */
const TELEMETRY = {
	/**
	 * Bound for one event post. A slow or blocked network drops the post and the record stays for
	 * the next round, so a firewall never holds the server.
	 */
	"telemetry.send": bound(5000, "PostHog to take an event"),
	/**
	 * Cadence of the sender. An error reaches PostHog within this time of the server seeing it, and
	 * a finished day within this time of midnight UTC.
	 */
	"telemetry.round": tick(5 * 60 * 1000),
	/** A record that no round could send in this time is deleted unsent. */
	"telemetry.keep": span(7 * 24 * 60 * 60 * 1000),
	/**
	 * A sender claims a file by renaming it. A claim this old belongs to a sender that died while it
	 * held it, so the file goes back to the queue.
	 */
	"telemetry.staleClaim": span(60 * 60 * 1000),
	/** Two agents whose commands come within this time of each other worked at the same time. */
	"telemetry.agentOverlap": span(30 * 60 * 1000),
};

export { TELEMETRY };
