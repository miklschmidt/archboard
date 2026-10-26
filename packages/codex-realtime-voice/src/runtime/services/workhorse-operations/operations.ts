import type {
	CodexWorkhorseOperations,
	WorkhorseOperationOptions,
} from "#runtime/protocol/workhorse-operations/contract.ts";
import type { WorkhorseRuntime } from "#runtime/rules/workhorse-operations/internal.ts";
import { createWorkhorseEvents } from "#runtime/services/workhorse-operations/events.ts";
import { createWorkhorseValidation } from "#runtime/services/workhorse-operations/validation.ts";
import { createNotificationHandler } from "#runtime/services/workhorse-operations/notifications.ts";
import {
	createInspect,
	createManageQueue,
} from "#runtime/operations/workhorse-operations/queue.ts";
import { createSteer } from "#runtime/operations/workhorse-operations/steer.ts";
import { createDelegate } from "#runtime/operations/workhorse-operations/turns.ts";

/**
 * Build the workhorse operations port: one serialised operation queue shared by inspect,
 * delegate, queue management and steer, so two coordinator effects never interleave on one
 * workhorse thread.
 * @param options - The session, queue, epoch, identity and classification authorities.
 * @returns The frozen operations port.
 */
export function createCodexWorkhorseOperations(
	options: WorkhorseOperationOptions,
): CodexWorkhorseOperations {
	let tail: Promise<void> = Promise.resolve();
	/**
	 * Run one unit of work after every operation enqueued before it, whether those succeeded or
	 * failed; a rejection settles the caller but never blocks the queue.
	 * @param work - The operation to run once its turn comes.
	 * @returns What the work produced.
	 */
	const enqueue = <Value>(work: () => Promise<Value>): Promise<Value> => {
		const result = tail.then(work, work);
		tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};
	const runtime: WorkhorseRuntime = {
		options,
		enqueue,
		...createWorkhorseValidation(options),
		...createWorkhorseEvents(options),
	};
	const inspect = createInspect(runtime);
	const delegate = createDelegate(runtime);
	const manageQueue = createManageQueue(runtime);
	const steer = createSteer(runtime);
	const onNotification = createNotificationHandler(runtime);
	return Object.freeze({
		inspect,
		delegate,
		manageQueue,
		steer,
		onNotification,
		subscribe: runtime.subscribe,
	});
}
