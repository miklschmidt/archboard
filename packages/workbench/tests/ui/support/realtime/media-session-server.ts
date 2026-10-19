// The realtime server the media session tests talk to, over the fake browser, and the
// microtask settle they wait with.

import type { AnswerSdp, RealtimeServer } from "#shared/protocol/realtime-contract.ts";
import type { FakeBrowser } from "#tests/ui/support/realtime/media-session-fakes.ts";

/**
 * A realtime server over the fake browser.
 * @param env The fake browser.
 * @returns The server.
 */
function realtimeServer(env: FakeBrowser): RealtimeServer {
	return {
		/**
		 * Answers the offer through the serverOffer stage gate.
		 * @param offer The offer.
		 * @returns The answer.
		 */
		createOffer: (offer) => env.stage<AnswerSdp>("serverOffer", { ...offer, sdp: "remote-answer" }),
		/**
		 * Hands the session a fresh element.
		 * @param attachment The attachment.
		 */
		attachRemoteMedia: (attachment) => {
			env.record("attachRemote");
			if (env.throwAttachment) {
				throw new Error("attachment failed");
			}
			env.attachment = attachment;
			attachment.attachTo(env.newElement().element);
		},
		/**
		 * No semantic events reach the browser.
		 * @returns A no-op unsubscribe.
		 */
		onSemanticEvent: () => () => undefined,
		/**
		 * Delivers text.
		 * @param request The request.
		 * @returns Delivered.
		 */
		appendText: (request) => Promise.resolve({ outcome: "delivered", ...request }),
		/**
		 * Delivers speech.
		 * @param request The request.
		 * @returns Delivered.
		 */
		appendSpeech: (request) => Promise.resolve({ outcome: "delivered", ...request }),
		/**
		 * Stops through the fake browser.
		 * @param request The request.
		 * @returns The configured outcome.
		 */
		stop: (request) => env.stop(request),
		/**
		 * Recovers.
		 * @param request The request.
		 * @returns Delivered.
		 */
		recover: (request) => Promise.resolve({ outcome: "delivered", ...request }),
	};
}

/**
 * Lets pending microtasks settle.
 * @param turns How many microtask turns to yield.
 */
async function settle(turns = 96): Promise<void> {
	let chain = Promise.resolve();
	for (let turn = 0; turn < turns; turn += 1) {
		chain = chain.then(() => undefined);
	}
	await chain;
}

export { realtimeServer, settle };
