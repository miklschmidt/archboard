import type {
	CoordinatorCallbackHostPolicy,
	CoordinatorHostContextSource,
} from "#runtime/protocol/voice/extension.ts";
import type {
	CoordinatorCallbackCanvas,
	CoordinatorCallbackOptions,
	CoordinatorPaneNews,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import {
	archboardContextOf,
	toHostSource,
} from "#runtime/rules/coordinator-callbacks/normalize.ts";
import { encodeCoordinatorCallback } from "#runtime/rules/coordinator-callbacks/encoding.ts";

/**
 * Select speech only when the news stops the current narration.
 * @param news The pane news.
 * @param canvas The current pane state.
 * @returns The voice channel.
 */
function channelOf(
	news: CoordinatorPaneNews,
	canvas: CoordinatorCallbackCanvas,
): "speech" | "context" {
	return news.stops &&
		canvas.narrated !== null &&
		(news.board === null || news.board === canvas.narrated)
		? "speech"
		: "context";
}

/**
 * Unsubscribe every acquired source, including when one cleanup fails.
 * @param cleanups The acquired source cleanups.
 */
function unsubscribe(cleanups: readonly (() => void)[]): void {
	for (const cleanup of cleanups) {
		try {
			cleanup();
		} catch {
			/* Cleanup cannot retain another source subscription. */
		}
	}
}

/**
 * Keep Archboard subscriptions, wire encoding, pane visibility and narration channels in the host.
 * @param options The domain publisher and current pane state.
 * @returns The host policy that grants no execution authority.
 */
function createArchboardCallbackPolicy(
	options: Pick<CoordinatorCallbackOptions, "semantic" | "canvas">,
): CoordinatorCallbackHostPolicy {
	return Object.freeze<CoordinatorCallbackHostPolicy>({
		/**
		 * Install all domain subscriptions or release every acquired subscription.
		 * @param listener The runtime callback receiver.
		 * @returns The cleanup for every subscription.
		 */
		subscribe(listener: (event: CoordinatorHostContextSource) => void) {
			const cleanups: Array<() => void> = [];
			try {
				cleanups.push(
					options.semantic.subscribeSettledChange((event) => listener(toHostSource(event))),
				);
				cleanups.push(
					options.semantic.subscribePaneFocus((event) => listener(toHostSource(event))),
				);
				cleanups.push(
					options.semantic.subscribePaneSelection((event) => listener(toHostSource(event))),
				);
			} catch (error) {
				unsubscribe(cleanups);
				throw error;
			}
			return () => unsubscribe(cleanups);
		},
		encode: encodeCoordinatorCallback,
		/**
		 * Suppress outside writes to a board that no pane shows at arrival, and refuse a payload that
		 * is not Archboard's.
		 * @param _event The source event.
		 * @param callback The normalized callback.
		 * @returns The refusal reason, or null.
		 */
		arrivalRefusal(_event, callback) {
			const context = archboardContextOf(callback);
			if (context === null) return "invalid_callback";
			const board = context.news?.board;
			return typeof board === "string" && !options.canvas().boards.includes(board)
				? "not_shown"
				: null;
		},
		/**
		 * Supply one sentence and choose its domain delivery policy.
		 * @param callback The normalized callback.
		 * @returns The requested channel or a record-only reason.
		 */
		delivery(callback) {
			const context = archboardContextOf(callback);
			if (context === null) return { reason: "invalid_callback" };
			const { news } = context;
			return news === null
				? { reason: "agent" }
				: {
						channel: channelOf(news, options.canvas()),
						text: news.sentence,
						reason: news.by === "agent" ? "agent" : null,
						coordinatorContext: news.by === "agent",
					};
		},
	});
}
export { createArchboardCallbackPolicy };
