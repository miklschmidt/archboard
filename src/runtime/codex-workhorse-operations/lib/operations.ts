import type {
	CodexWorkhorseOperations,
	WorkhorseOperationOptions,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import type { WorkhorseRuntime } from "@/runtime/codex-workhorse-operations/lib/internal";
import { createWorkhorseEvents } from "@/runtime/codex-workhorse-operations/lib/events";
import { createWorkhorseValidation } from "@/runtime/codex-workhorse-operations/lib/validation";
import { createNotificationHandler } from "@/runtime/codex-workhorse-operations/lib/notifications";
import { createInspect, createManageQueue } from "@/runtime/codex-workhorse-operations/lib/queue";
import { createSteer } from "@/runtime/codex-workhorse-operations/lib/steer";
import { createDelegate } from "@/runtime/codex-workhorse-operations/lib/turns";

/**
 *
 */
export function createCodexWorkhorseOperations(
	options: WorkhorseOperationOptions,
): CodexWorkhorseOperations {
	let tail: Promise<void> = Promise.resolve();
	/**
	 *
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
