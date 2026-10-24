import type {
	CoordinatorCallbackHostPolicy,
	CoordinatorCallbackCanvas,
	CoordinatorSemanticCallback,
	CoordinatorHostCallbackSource,
} from "@archboard/agent-workbench/runtime";
import type { CoordinatorCallbackOptions } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { toHostSource } from "#runtime/rules/coordinator-callbacks/normalize.ts";
import { encodeCoordinatorCallback } from "#runtime/rules/coordinator-callbacks/encoding.ts";

/**
 * Select speech only when the news stops the current narration.
 * @param callback The normalized callback.
 * @param canvas The current pane state.
 * @returns The voice channel.
 */
function channelOf(
	callback: CoordinatorSemanticCallback,
	canvas: CoordinatorCallbackCanvas,
): "speech" | "context" {
	const news = callback.semantic.news;
	return news?.stops &&
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
		subscribe(listener: (event: CoordinatorHostCallbackSource) => void) {
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
		 * Suppress outside writes that no pane shows at arrival.
		 * @param _event The source event.
		 * @param callback The normalized callback.
		 * @returns The refusal reason, or null.
		 */
		arrivalRefusal(_event, callback) {
			const board = callback.semantic.news?.board;
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
			const news = callback.semantic.news;
			return news === null
				? { reason: "agent" }
				: {
						channel: channelOf(callback, options.canvas()),
						text: news.sentence,
						reason: news.by === "agent" ? "agent" : null,
						coordinatorContext: news.by === "agent",
					};
		},
	});
}
export { createArchboardCallbackPolicy };
