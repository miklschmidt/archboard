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

/** Own one continuous server realtime session for one exact browser socket binding. */
export function createCanvasRealtimeActions(
	components: RealtimeComponents,
): BrowserRealtimeActions {
	let activeRealtime: ActiveRealtime | null = null;
	let realtimeQueue = Promise.resolve();
	/**
	 *
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
	 *
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
	 *
	 */
	const requireActive = (handle: string, context: BrowserActionContext): ActiveRealtime => {
		const active = activeRealtime;
		const coordinator = components.coordinator.snapshot();
		if (
			active === null ||
			active.handle !== handle ||
			active.connection !== context.connection ||
			active.browserId !== context.browserId ||
			active.paneId !== context.paneId ||
			active.childId !== context.childId ||
			active.epoch !== context.epoch ||
			active.threadId !== context.link.threadId ||
			coordinator.state !== "ready" ||
			coordinator.threadId !== active.coordinatorThreadId ||
			coordinator.childId !== active.childId ||
			coordinator.epoch !== active.epoch
		) {
			throw new Error("The realtime session handle is stale for this exact browser binding.");
		}
		return active;
	};

	const actions: BrowserRealtimeActions = {
		/**
		 *
		 */
		start: (command, context) =>
			serialize(async () => {
				if (activeRealtime !== null) {
					await stopActive();
				}
				const coordinator = components.coordinator.snapshot();
				const workhorse = components.workhorse.snapshot();
				if (
					context.link.threadId === null ||
					coordinator.state !== "ready" ||
					coordinator.threadId === null ||
					coordinator.childId !== context.childId ||
					coordinator.epoch !== context.epoch ||
					workhorse.state !== "ready" ||
					workhorse.threadId !== context.link.threadId
				) {
					throw new Error("Realtime is unavailable for this exact linked thread.");
				}
				const handle = String(command.commandId);
				const pending = Object.freeze({
					handle,
					connection: context.connection,
					browserId: context.browserId,
					paneId: context.paneId,
					childId: context.childId,
					epoch: context.epoch,
					threadId: context.link.threadId,
					coordinatorThreadId: coordinator.threadId,
					sessionId: parseRealtimeSessionId(handle),
					correlationId: parseRealtimeCorrelationId(handle),
				}) satisfies ActiveRealtime;
				activeRealtime = pending;
				try {
					const realtimeAnswer = await components.realtime.createOffer({
						sessionId: pending.sessionId,
						correlationId: pending.correlationId,
						sdp: command.sdp,
					});
					requireActive(handle, context);
					return {
						outcome: "delivered" as const,
						realtimeAnswer,
						realtimeSessionHandle: handle,
					};
				} catch (error) {
					if (activeRealtime === pending) {
						activeRealtime = null;
					}
					throw error;
				}
			}),
		/**
		 *
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
		 *
		 */
		stop: (command, context) =>
			serialize(async () => {
				const active = requireActive(command.realtimeSessionHandle, context);
				await stopActive(active);
				return { outcome: "delivered" as const };
			}),
		/**
		 *
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
