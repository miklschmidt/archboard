// The one network call of Archboard's telemetry: one event to PostHog EU Cloud (ADR 0079).

import { TELEMETRY_MS } from "#runtime/constants/durations.ts";
import type { CaptureEvent } from "#runtime/sending/rules/events.ts";

/** PostHog EU Cloud's capture endpoint. */
const CAPTURE_URL = "https://eu.i.posthog.com/i/v0/e/";

/**
 * The project key of Archboard's PostHog project. It only lets a sender add events, and every
 * page of the public site holds it, so it is public by design.
 */
const PROJECT_KEY = "phc_nbBrLCBHu8giWWB33kEXcHomsMEGijLofD5kepEjRkWN";

/**
 * What became of one post: PostHog took it, PostHog will never take it, or it can be tried again.
 */
type PostResult = "sent" | "refused" | "failed";

/** Posts one event. Tests give their own. */
type PostEvent = (event: CaptureEvent) => Promise<PostResult>;

/**
 * Post one event to PostHog, within `TELEMETRY_MS.send`.
 * @param event The event.
 * @returns `sent` for 2xx, `refused` for another 4xx, and `failed` for anything else.
 */
async function postToPostHog(event: CaptureEvent): Promise<PostResult> {
	try {
		const reply = await fetch(CAPTURE_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ api_key: PROJECT_KEY, ...event }),
			signal: AbortSignal.timeout(TELEMETRY_MS.send),
		});
		await reply.body?.cancel();
		return resultOf(reply.status);
	} catch {
		return "failed";
	}
}

/**
 * What an HTTP status means for the post.
 * @param status The status of PostHog's reply.
 * @returns `sent` for 2xx, `refused` for a 4xx other than 429, and `failed` for the rest.
 */
function resultOf(status: number): PostResult {
	if (status >= 200 && status < 300) return "sent";
	return status >= 400 && status < 500 && status !== 429 ? "refused" : "failed";
}

export { postToPostHog, type PostEvent, type PostResult };
