import type { CodexWorkhorseOperations, WorkhorseOperationOptions } from "./contract.js";
import type { WorkhorseRuntime } from "./internal.js";
import { createWorkhorseEvents } from "./events.js";
import { createWorkhorseValidation } from "./validation.js";
import { createNotificationHandler } from "./notifications.js";
import { createInspect, createManageQueue } from "./queue.js";
import { createSteer } from "./steer.js";
import { createDelegate } from "./turns.js";

export function createCodexWorkhorseOperations(
	options: WorkhorseOperationOptions,
): CodexWorkhorseOperations {
	let tail: Promise<void> = Promise.resolve();
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
