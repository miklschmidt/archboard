import type {
	CodexWorkhorseOperations,
	WorkhorseOperationOptions,
} from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import type { WorkhorseRuntime } from "#runtime/workhorses/workhorse-operations/rules/internal.ts";
import { createWorkhorseEvents } from "#runtime/workhorses/workhorse-operations/services/events.ts";
import { createWorkhorseValidation } from "#runtime/workhorses/workhorse-operations/services/validation.ts";
import { createNotificationHandler } from "#runtime/workhorses/workhorse-operations/services/notifications.ts";
import {
	createInspect,
	createManageQueue,
} from "#runtime/workhorses/workhorse-operations/operations/queue.ts";
import { createSteer } from "#runtime/workhorses/workhorse-operations/operations/steer.ts";
import { createDelegate } from "#runtime/workhorses/workhorse-operations/operations/turns.ts";

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
