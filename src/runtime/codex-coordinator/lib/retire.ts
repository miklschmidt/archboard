import type { SessionNotificationHandler, SessionThread } from "@/runtime/codex-session";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexCoordinatorOptions,
	CoordinatorRetirement,
} from "@/runtime/codex-coordinator/lib/contract";
import { isCurrentNotification } from "@/runtime/codex-coordinator/lib/start-profile";
import { errorMessage } from "@/runtime/codex-coordinator/lib/state";

/** A retired thread the coordinator waits on before it unsubscribes. */
interface RetiringThread {
	/** The thread's last known status type, or null until the read or a notification says it. */
	status: SessionThread["status"]["type"] | null;
	/** Whether a status notification arrived after the wait began, which outranks the read. */
	heard: boolean;
	readonly report: (retirement: CoordinatorRetirement) => void;
}

/**
 * Build what unsubscribes a retired coordinator thread once nothing runs on it, so Codex unloads
 * it. Codex unloads a thread with no subscriber only while it is not active, so the unsubscribe
 * never cuts a turn short. It must still wait for two things. A running turn sends its tool calls
 * and approvals only to subscribers, so an unsubscribe during a turn would leave that turn waiting
 * forever. And Codex starts the turn for the end of a voice session's transcript before it sends
 * `thread/realtime/closed`, while the realtime stop is answered before that. So a thread is
 * unsubscribed only once its voice session has closed and its status is not active.
 * @param options - The session and the identity authority.
 * @returns The retire step and the notification handler it waits through.
 */
function createCoordinatorRetirement(options: CodexCoordinatorOptions): {
	readonly retire: (
		threadId: ThreadId,
		report: (retirement: CoordinatorRetirement) => void,
	) => Promise<void>;
	readonly onNotification: SessionNotificationHandler;
} {
	// Kept for every thread from the start of the child, since a session opens before its retirement.
	const openRealtime = new Set<ThreadId>();
	const retiring = new Map<ThreadId, RetiringThread>();

	/**
	 * The thread a notification names, or null when it is not one this child issued.
	 * @param rawThreadId - The notification's thread id.
	 * @returns The thread id.
	 */
	const threadOf = (rawThreadId: string): ThreadId | null => {
		try {
			return options.identity.decoder.resolveThreadId(rawThreadId);
		} catch {
			return null;
		}
	};

	/**
	 * Unsubscribe a retiring thread once its voice session has closed and its status is known and
	 * not active. Anything else keeps waiting for the notification that changes it.
	 * @param threadId - The thread.
	 * @param thread - Its wait, which must still be the current one.
	 */
	const settle = (threadId: ThreadId, thread: RetiringThread): void => {
		if (
			retiring.get(threadId) !== thread ||
			thread.status === null ||
			thread.status === "active" ||
			openRealtime.has(threadId)
		) {
			return;
		}
		retiring.delete(threadId);
		options.session.threadUnsubscribe({ threadId }).then(
			({ status }) => thread.report({ threadId, outcome: status }),
			(error: unknown) =>
				thread.report({ threadId, outcome: "failed", message: errorMessage(error) }),
		);
	};

	/**
	 * Wait for a retired thread to go quiet, then unsubscribe it. The wait is registered before the
	 * read, so no status change between the two is lost.
	 * @param threadId - The retired thread.
	 * @param report - Told what became of it.
	 */
	const retire = async (
		threadId: ThreadId,
		report: (retirement: CoordinatorRetirement) => void,
	): Promise<void> => {
		const thread: RetiringThread = { status: null, heard: false, report };
		retiring.set(threadId, thread);
		try {
			const read = await options.session.threadRead({ threadId, includeTurns: false });
			if (!thread.heard) {
				thread.status = read.thread.status.type;
			}
		} catch (error) {
			retiring.delete(threadId);
			report({ threadId, outcome: "failed", message: errorMessage(error) });
			return;
		}
		settle(threadId, thread);
	};

	/**
	 * A thread's voice session closed: a retiring thread may now be quiet.
	 * @param threadId - The thread.
	 */
	const voiceClosed = (threadId: ThreadId): void => {
		openRealtime.delete(threadId);
		const thread = retiring.get(threadId);
		if (thread !== undefined) {
			settle(threadId, thread);
		}
	};

	/**
	 * A retiring thread's status changed; any other thread's is not followed.
	 * @param threadId - The thread.
	 * @param status - Its new status type.
	 */
	const statusChanged = (threadId: ThreadId, status: RetiringThread["status"]): void => {
		const thread = retiring.get(threadId);
		if (thread !== undefined) {
			thread.status = status;
			thread.heard = true;
			settle(threadId, thread);
		}
	};

	/**
	 * What a followed notification changes, and for which raw thread id.
	 * @param notification - The notification.
	 * @returns The change, or null for a notification this does not follow.
	 */
	const followedChange = (
		notification: TransportServerNotification["notification"],
	): { readonly rawThreadId: string; readonly apply: (threadId: ThreadId) => void } | null => {
		switch (notification.method) {
			case "thread/realtime/started":
				return {
					rawThreadId: notification.params.threadId,
					/**
					 * The thread's voice session opened.
					 * @param threadId - The thread.
					 */
					apply: (threadId) => {
						openRealtime.add(threadId);
					},
				};
			case "thread/realtime/closed":
				return { rawThreadId: notification.params.threadId, apply: voiceClosed };
			case "thread/status/changed": {
				const status = notification.params.status.type;
				return {
					rawThreadId: notification.params.threadId,
					/**
					 * The thread's status changed.
					 * @param threadId - The thread.
					 */
					apply: (threadId) => {
						statusChanged(threadId, status);
					},
				};
			}
			default:
				return null;
		}
	};

	/**
	 * Follow each thread's voice session, and the status of each thread being retired.
	 * @param event - The transport notification.
	 */
	const onNotification: SessionNotificationHandler = (event) => {
		if (!isCurrentNotification(event, options)) {
			return;
		}
		const change = followedChange(event.notification);
		const threadId = change === null ? null : threadOf(change.rawThreadId);
		if (change !== null && threadId !== null) {
			change.apply(threadId);
		}
	};

	return Object.freeze({ retire, onNotification });
}

export { createCoordinatorRetirement };
