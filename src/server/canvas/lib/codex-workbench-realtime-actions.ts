import type { BrowserActionContext, BrowserRealtimeActions } from "@/server/codex-workbench";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

type RealtimeComponents = Pick<CodexWorkbenchComponents, "coordinator" | "realtime" | "workhorse">;

type ActiveRealtime = Readonly<{
	handle: string;
	connection: BrowserActionContext["connection"];
	browserId: string;
	paneId: string;
	childId: ChildId;
	epoch: ChildEpoch;
	threadId: ThreadId;
	coordinatorThreadId: ThreadId;
	sessionId: ReturnType<typeof parseRealtimeSessionId>;
	correlationId: ReturnType<typeof parseRealtimeCorrelationId>;
}>;

/** The coordinator as it describes itself. */
type CoordinatorSnapshot = ReturnType<RealtimeComponents["coordinator"]["snapshot"]>;

/** The workhorse as it describes itself. */
type WorkhorseSnapshot = ReturnType<RealtimeComponents["workhorse"]["snapshot"]>;

/**
 * Whether a realtime session belongs to the exact browser socket this command
 * came in on.
 * @param active The realtime session.
 * @param context The pane and its connection.
 * @returns True when it is the same socket.
 */
function sameSocket(active: ActiveRealtime, context: BrowserActionContext): boolean {
	return (
		active.connection === context.connection &&
		active.browserId === context.browserId &&
		active.paneId === context.paneId
	);
}

/**
 * Whether a realtime session belongs to the exact thread link this command came
 * in on.
 * @param active The realtime session.
 * @param context The pane and the link it named.
 * @returns True when it is the same link.
 */
function sameLink(active: ActiveRealtime, context: BrowserActionContext): boolean {
	return (
		active.childId === context.childId &&
		active.epoch === context.epoch &&
		active.threadId === context.link.threadId
	);
}

/**
 * Whether the coordinator is still the one this realtime session was started
 * against: voice belongs to that coordinator and to no other.
 * @param coordinator The coordinator snapshot.
 * @param active The realtime session.
 * @returns True when it is the same coordinator.
 */
function coordinatorHolds(coordinator: CoordinatorSnapshot, active: ActiveRealtime): boolean {
	return (
		coordinator.state === "ready" &&
		coordinator.threadId === active.coordinatorThreadId &&
		coordinator.childId === active.childId &&
		coordinator.epoch === active.epoch
	);
}

/**
 * Whether a realtime session is the one this command may act on: the same
 * handle, socket, link, and coordinator it was started under.
 * @param active The realtime session.
 * @param handle The handle the command named.
 * @param context The pane and the link it named.
 * @param coordinator The coordinator snapshot.
 * @returns True when the command may act on it.
 */
function isCurrentRealtime(
	active: ActiveRealtime,
	handle: string,
	context: BrowserActionContext,
	coordinator: CoordinatorSnapshot,
): boolean {
	return (
		active.handle === handle &&
		sameSocket(active, context) &&
		sameLink(active, context) &&
		coordinatorHolds(coordinator, active)
	);
}

/**
 * Whether the coordinator can carry voice for this pane right now.
 * @param coordinator The coordinator snapshot.
 * @param context The pane and its child epoch.
 * @returns True when it can.
 */
function coordinatorReadyFor(
	coordinator: CoordinatorSnapshot,
	context: BrowserActionContext,
): boolean {
	return (
		coordinator.state === "ready" &&
		coordinator.childId === context.childId &&
		coordinator.epoch === context.epoch
	);
}

/**
 * Whether the workhorse is running the thread this pane is linked to, which is
 * the thread voice would be speaking about.
 * @param workhorse The workhorse snapshot.
 * @param threadId The pane's linked thread.
 * @returns True when it is.
 */
function workhorseReadyFor(workhorse: WorkhorseSnapshot, threadId: ThreadId): boolean {
	return workhorse.state === "ready" && workhorse.threadId === threadId;
}

/**
 * Own one continuous server realtime session for one exact browser socket
 * binding.
 * @param components The coordinator, the realtime adapter, and the workhorse.
 * @returns The actions.
 */
export function createCanvasRealtimeActions(
	components: RealtimeComponents,
): BrowserRealtimeActions {
	let activeRealtime: ActiveRealtime | null = null;
	let realtimeQueue = Promise.resolve();
	/**
	 * Run one realtime operation after the last one has settled: a session is a
	 * single continuous thing, and two commands must not overlap on it.
	 * @param operation The operation.
	 * @returns What the operation answered.
	 */
	const serialize = <Value>(operation: () => Promise<Value>): Promise<Value> => {
		const pending = realtimeQueue.then(operation);
		realtimeQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};
	/**
	 * Stop the realtime session, leaving alone one that has already been
	 * replaced by a later start.
	 * @param expected The session the caller means, or every session when
	 * the caller means whichever is active.
	 */
	const stopActive = async (expected?: ActiveRealtime): Promise<void> => {
		const active = activeRealtime;
		if (active === null || (expected !== undefined && active !== expected)) {
			return;
		}
		try {
			await components.realtime.stop({
				sessionId: active.sessionId,
				correlationId: active.correlationId,
			});
		} finally {
			if (activeRealtime === active) {
				activeRealtime = null;
			}
		}
	};
	/**
	 * The realtime session one command may act on, refused when the handle no
	 * longer names this exact browser binding.
	 * @param handle The handle the command named.
	 * @param context The pane and the link it named.
	 * @returns The session.
	 */
	const requireActive = (handle: string, context: BrowserActionContext): ActiveRealtime => {
		const active = activeRealtime;
		if (active === null) {
			throw new Error("The realtime session handle is stale for this exact browser binding.");
		}
		if (!isCurrentRealtime(active, handle, context, components.coordinator.snapshot())) {
			throw new Error("The realtime session handle is stale for this exact browser binding.");
		}
		return active;
	};
	/**
	 * The session one start would own, refused unless the coordinator and the
	 * workhorse are both on this pane's linked thread.
	 * @param commandId The command starting it, which is also its handle.
	 * @param context The pane and the link it named.
	 * @returns The session, not yet offered.
	 */
	const pendingRealtime = (
		commandId: BrowserActionContext["commandId"],
		context: BrowserActionContext,
	): ActiveRealtime => {
		const coordinator = components.coordinator.snapshot();
		const threadId = context.link.threadId;
		const coordinatorThreadId = coordinator.threadId;
		if (
			threadId === null ||
			coordinatorThreadId === null ||
			!coordinatorReadyFor(coordinator, context) ||
			!workhorseReadyFor(components.workhorse.snapshot(), threadId)
		) {
			throw new Error("Realtime is unavailable for this exact linked thread.");
		}
		const handle = String(commandId);
		return Object.freeze({
			handle,
			connection: context.connection,
			browserId: context.browserId,
			paneId: context.paneId,
			childId: context.childId,
			epoch: context.epoch,
			threadId,
			coordinatorThreadId,
			sessionId: parseRealtimeSessionId(handle),
			correlationId: parseRealtimeCorrelationId(handle),
		});
	};

	const actions: BrowserRealtimeActions = {
		/**
		 * Start voice for one pane, replacing whatever session was running.
		 * @param command The offer.
		 * @param context The pane and the link it named.
		 * @returns The answer, and the handle the pane holds the session by.
		 */
		start: (command, context) =>
			serialize(async () => {
				if (activeRealtime !== null) {
					await stopActive();
				}
				const pending = pendingRealtime(command.commandId, context);
				activeRealtime = pending;
				try {
					const realtimeAnswer = await components.realtime.createOffer({
						sessionId: pending.sessionId,
						correlationId: pending.correlationId,
						sdp: command.sdp,
					});
					requireActive(pending.handle, context);
					return {
						outcome: "delivered" as const,
						realtimeAnswer,
						realtimeSessionHandle: pending.handle,
					};
				} catch (error) {
					if (activeRealtime === pending) {
						activeRealtime = null;
					}
					throw error;
				}
			}),
		/**
		 * Say something into the running session as typed text.
		 * @param command The handle and the text.
		 * @param context The pane and the link it named.
		 * @returns The browser outcome.
		 */
		appendText: (command, context) =>
			serialize(async () => {
				const active = requireActive(command.realtimeSessionHandle, context);
				await components.realtime.appendText({
					sessionId: active.sessionId,
					correlationId: active.correlationId,
					text: command.text,
				});
				return { outcome: "delivered" as const };
			}),
		/**
		 * Stop the session this pane started.
		 * @param command The handle.
		 * @param context The pane and the link it named.
		 * @returns The browser outcome.
		 */
		stop: (command, context) =>
			serialize(async () => {
				const active = requireActive(command.realtimeSessionHandle, context);
				await stopActive(active);
				return { outcome: "delivered" as const };
			}),
		/**
		 * Stop the session a browser that has gone was speaking through.
		 * @param context The pane and its connection.
		 * @param reason Why the browser stopped listening.
		 * @returns The stop, when there is one to wait on.
		 */
		onBrowserDisconnect: (context, reason) => {
			if (
				reason !== "browser_disconnected" &&
				reason !== "child_disconnected" &&
				reason !== "gateway_shutdown"
			) {
				return;
			}
			const active = activeRealtime;
			if (active === null || active.connection !== context.connection) {
				return;
			}
			return serialize(() => stopActive(active));
		},
	};
	return Object.freeze(actions);
}
