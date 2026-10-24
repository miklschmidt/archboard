import type {
	CodexSession,
	SessionNotificationHandler,
	SessionResponse,
	SessionThread,
} from "@archboard/codex-app-server/session";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type {
	IdentityValidator,
	ThreadId,
	TrustedIdentityDecoder,
} from "@archboard/codex-app-server/identity";

/**
 * What became of a thread given up: Codex's answer to its unsubscribe, or why the thread could not
 * be read or unsubscribed. The thread keeps its rollout either way.
 */
type ThreadUnload =
	| {
			readonly threadId: ThreadId;
			readonly outcome: SessionResponse<"thread/unsubscribe">["status"];
	  }
	| { readonly threadId: ThreadId; readonly outcome: "failed"; readonly message: string };

interface CodexThreadUnloadOptions {
	readonly session: Pick<CodexSession, "threadRead" | "threadUnsubscribe">;
	readonly identity: {
		readonly validator: Pick<IdentityValidator, "childId" | "epoch">;
		readonly decoder: Pick<TrustedIdentityDecoder, "resolveThreadId">;
	};
}

interface CodexThreadUnload {
	/**
	 * Unsubscribe a thread once nothing runs on it, so Codex unloads it. Resolves with what became
	 * of it; a second call for a thread already waiting shares the first one's wait.
	 */
	readonly unload: (threadId: ThreadId) => Promise<ThreadUnload>;
	/** Follow every notification of the child: voice sessions opening and closing, thread status. */
	readonly onNotification: SessionNotificationHandler;
}

/** A thread waiting to be unsubscribed. */
interface UnloadingThread {
	/** The thread's last known status type, or null until the read or a notification says it. */
	status: SessionThread["status"]["type"] | null;
	/** Whether a status notification arrived after the wait began, which outranks the read. */
	heard: boolean;
	/** Whether its unsubscribe has been sent, so nothing sends it again. */
	unsubscribing: boolean;
	readonly settled: Promise<ThreadUnload>;
	readonly report: (unload: ThreadUnload) => void;
}

/**
 * Say what a failure was.
 * @param error - Whatever was thrown.
 * @returns Its message.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

/**
 * Build what unsubscribes a thread once nothing runs on it, so Codex unloads it: a coordinator a
 * replacement retired, a workhorse a new conversation left, or every thread of a tab session that
 * ended. Codex unloads a thread with no subscriber only while it is not active, so the unsubscribe
 * never cuts a turn short. It must still wait for two things. A running turn sends its tool calls
 * and approvals only to subscribers, so an unsubscribe during a turn would leave that turn waiting
 * forever. And Codex starts the turn for the end of a voice session's transcript before it sends
 * `thread/realtime/closed`, while the realtime stop is answered before that. So a thread is
 * unsubscribed only once its voice session, if it had one, has closed and its status is not
 * active. A workhorse thread carries no voice session, so it waits only for its turn.
 * @param options - The session and the identity authority.
 * @returns The unload step and the notification handler it waits through.
 */
function createCodexThreadUnload(options: CodexThreadUnloadOptions): CodexThreadUnload {
	// Kept for every thread from the start of the child, since a voice session opens before its
	// thread is given up.
	const openRealtime = new Set<ThreadId>();
	const unloading = new Map<ThreadId, UnloadingThread>();

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
	 * Finish one wait: forget it and say what became of the thread.
	 * @param threadId - The thread.
	 * @param thread - Its wait.
	 * @param unload - What became of it.
	 */
	const finish = (threadId: ThreadId, thread: UnloadingThread, unload: ThreadUnload): void => {
		if (unloading.get(threadId) === thread) {
			unloading.delete(threadId);
		}
		thread.report(unload);
	};

	/**
	 * Unsubscribe a waiting thread once its voice session has closed and its status is known and
	 * not active. Anything else keeps waiting for the notification that changes it.
	 * @param threadId - The thread.
	 * @param thread - Its wait, which must still be the current one.
	 */
	const settle = (threadId: ThreadId, thread: UnloadingThread): void => {
		if (
			unloading.get(threadId) !== thread ||
			thread.unsubscribing ||
			thread.status === null ||
			thread.status === "active" ||
			openRealtime.has(threadId)
		) {
			return;
		}
		thread.unsubscribing = true;
		options.session.threadUnsubscribe({ threadId }).then(
			({ status }) => finish(threadId, thread, { threadId, outcome: status }),
			(error: unknown) =>
				finish(threadId, thread, { threadId, outcome: "failed", message: errorMessage(error) }),
		);
	};

	/**
	 * Wait for a thread to go quiet, then unsubscribe it. The wait is registered before the read,
	 * so no status change between the two is lost.
	 * @param threadId - The thread.
	 * @returns What became of it.
	 */
	const unload = (threadId: ThreadId): Promise<ThreadUnload> => {
		const waiting = unloading.get(threadId);
		if (waiting !== undefined) {
			return waiting.settled;
		}
		let report!: (unload: ThreadUnload) => void;
		const settled = new Promise<ThreadUnload>((resolve) => {
			report = resolve;
		});
		const thread: UnloadingThread = {
			status: null,
			heard: false,
			unsubscribing: false,
			settled,
			report,
		};
		unloading.set(threadId, thread);
		options.session.threadRead({ threadId, includeTurns: false }).then(
			(read) => {
				if (!thread.heard) {
					thread.status = read.thread.status.type;
				}
				settle(threadId, thread);
				return undefined;
			},
			(error: unknown) =>
				finish(threadId, thread, { threadId, outcome: "failed", message: errorMessage(error) }),
		);
		return settled;
	};

	/**
	 * A thread's voice session closed: a waiting thread may now be quiet.
	 * @param threadId - The thread.
	 */
	const voiceClosed = (threadId: ThreadId): void => {
		openRealtime.delete(threadId);
		const thread = unloading.get(threadId);
		if (thread !== undefined) {
			settle(threadId, thread);
		}
	};

	/**
	 * A waiting thread's status changed; any other thread's is not followed.
	 * @param threadId - The thread.
	 * @param status - Its new status type.
	 */
	const statusChanged = (threadId: ThreadId, status: UnloadingThread["status"]): void => {
		const thread = unloading.get(threadId);
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
	 * Follow each thread's voice session, and the status of each thread waiting to be unloaded,
	 * ignoring anything from another child epoch.
	 * @param event - The transport notification.
	 */
	const onNotification: SessionNotificationHandler = (event) => {
		if (
			event.correlation.child !== options.identity.validator.childId ||
			event.correlation.epoch !== options.identity.validator.epoch
		) {
			return;
		}
		const change = followedChange(event.notification);
		const threadId = change === null ? null : threadOf(change.rawThreadId);
		if (change !== null && threadId !== null) {
			change.apply(threadId);
		}
	};

	return Object.freeze({ unload, onNotification });
}

export { createCodexThreadUnload };
export type { CodexThreadUnload, CodexThreadUnloadOptions, ThreadUnload };
