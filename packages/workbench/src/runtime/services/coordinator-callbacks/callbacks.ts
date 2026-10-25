import {
	createCodexCoordinatorCallbacks as createCoreCallbacks,
	CALLBACK_BUFFER_LIMIT,
} from "@archboard/codex-realtime-voice/runtime";
import type {
	CoordinatorCallbackSource,
	CoordinatorCallbackOptions,
	CoordinatorCallbacks,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import { callbackSource } from "#runtime/rules/coordinator-callbacks/normalize.ts";
import { createArchboardCallbackPolicy } from "#runtime/services/coordinator-callbacks/deliver.ts";

/**
 * Connect Archboard sources to the runtime callback owner.
 * @param options The domain sources and runtime authorities.
 * @returns The callback owner with domain source adapters.
 */
function createArchboardCoordinatorCallbacks(
	options: CoordinatorCallbackOptions,
): CoordinatorCallbacks {
	const callbacks = createCoreCallbacks({
		...options,
		host: createArchboardCallbackPolicy(options),
	});
	return Object.freeze({
		...callbacks,
		/**
		 * Queue a domain source through the single callback owner.
		 * @param event The source event.
		 * @returns Its settled delivery.
		 */
		enqueue: (event: CoordinatorCallbackSource) => callbacks.enqueue(callbackSource(event)),
		/**
		 * Read the settled delivery for a domain source.
		 * @param event The source event.
		 * @returns Its delivery, if settled.
		 */
		get: (event: CoordinatorCallbackSource) => callbacks.get(callbackSource(event)),
	});
}

export {
	createArchboardCoordinatorCallbacks,
	createArchboardCoordinatorCallbacks as createCodexCoordinatorCallbacks,
	createArchboardCallbackPolicy,
	CALLBACK_BUFFER_LIMIT,
};
export {
	coordinatorCallbackKey,
	normalizeCoordinatorCallback,
} from "#runtime/rules/coordinator-callbacks/normalize.ts";
