import type { CodexWorkbenchSessionComponents } from "#server/protocol/generation/session-contract.ts";
import type { CodexWorkbenchWorkhorseComponents } from "#server/services/sessions/workhorses.ts";

function unavailable(owner: string): never {
	throw new Error(`The tab session fixture does not implement ${owner}.`);
}

/**
 * Inert owners of one tab session, recording what shutdown and child exit do to them.
 * @param events Where each owner records what happened to it.
 * @returns The owners.
 */
export function createSessionComponentsFixture(events: string[]): CodexWorkbenchSessionComponents {
	const semanticPublisher = {
		subscribeSettledChange: () => () => undefined,
		freshBrief: () => ({
			brief: "Test task context.",
			freshness: { state: "fresh" as const, capturedAtMs: 1, freshUntilMs: 2 },
		}),
		freshBriefForRealtime: () => "Test task context.",
		dispose: () => void events.push("publisher:dispose"),
	} satisfies CodexWorkbenchSessionComponents["semanticPublisher"];
	const realtime = {
		createOffer: async () => unavailable("realtime.createOffer"),
		onSemanticEvent: () => () => undefined,
		appendText: async () => unavailable("realtime.appendText"),
		appendSpeech: async () => unavailable("realtime.appendSpeech"),
		stop: async () => unavailable("realtime.stop"),
		recover: async () => unavailable("realtime.recover"),
		onNotification: () => undefined,
		transcript: () => [],
		generation: () => null,
		presentation: () => null,
		dispose: () => void events.push("realtime:dispose"),
	} satisfies CodexWorkbenchSessionComponents["realtime"];
	const coordinator = {
		ensure: async () => unavailable("coordinator.ensure"),
		replace: async () => unavailable("coordinator.replace"),
		snapshot: () => ({
			state: "unbound",
			threadId: null,
			childId: null,
			epoch: null,
			operationId: null,
			configured: null,
			effective: null,
			approvalPolicy: null,
			approvalsReviewer: null,
			sandboxPolicy: null,
			activePermissionProfile: null,
			review: null,
			capabilities: {
				web: true,
				shell: true,
				repository: true,
				approvals: true,
				boundedBoardAction: true,
				sustainedWork: "instruction_policy",
			},
			persistence: null,
			reason: null,
		}),
		persisted: () => null,
		onNotification: () => undefined,
	} satisfies CodexWorkbenchSessionComponents["coordinator"];
	const spokenApproval = {
		arm: () => unavailable("spokenApproval.arm"),
		snapshot: () => ({
			state: "idle",
			requestId: null,
			approvalId: null,
			child: null,
			epoch: null,
			coordinatorThreadId: null,
			realtimeSessionId: null,
			realtimeCorrelationId: null,
			effectSummary: null,
			effectFingerprint: null,
			effectPromptItemId: null,
			effectPromptSequence: null,
			finalUserItemId: null,
			finalUserSequence: null,
			finalUserText: null,
			operationId: null,
			classifierTurnId: null,
			resolverCallId: null,
			expiresAtMs: null,
			settlement: null,
			reason: null,
		}),
		onSemanticEvent: () => undefined,
		onNotification: () => undefined,
		resolve: async () => unavailable("spokenApproval.resolve"),
		onChildExit: () => undefined,
		dispose: () => void events.push("spoken:dispose"),
	} satisfies CodexWorkbenchSessionComponents["spokenApproval"];
	const coordinatorTools = {
		dispatch: async () => unavailable("coordinatorTools.dispatch"),
		onServerRequest: (value: { readonly method: string }) =>
			void events.push(`coordinator:${value.method}`),
		cancel: () => undefined,
		onChildExit: () => undefined,
		replayState: () => ({
			liveWireCount: 0,
			retainedWireCount: 0,
			liveLogicalCount: 0,
			retainedLogicalCount: 0,
			retainedFingerprintBytes: 0,
		}),
		dispose: () => void events.push("coordinator-tools:dispose"),
	} satisfies CodexWorkbenchSessionComponents["coordinatorTools"];
	const callbacks = {
		enqueue: async () => unavailable("callbacks.enqueue"),
		flush: async () => undefined,
		inspect: () => [],
		inspectHistory: () => ({ deliveries: [], omittedPrefixCount: 0 }),
		get: () => undefined,
		pendingCount: () => 0,
		onNotification: () => undefined,
		onServerRequest: () => undefined,
		dispose: () => void events.push("callbacks:dispose"),
	} satisfies CodexWorkbenchSessionComponents["callbacks"];
	return {
		semanticPublisher,
		realtime,
		coordinator,
		spokenApproval,
		coordinatorTools,
		callbacks,
	};
}

/**
 * Inert owners of one workhorse, recording what shutdown and child exit do to them.
 * @param events Where each owner records what happened to it.
 * @returns The owners.
 */
export function createWorkhorseComponentsFixture(
	events: string[],
): CodexWorkbenchWorkhorseComponents {
	const workhorse = {
		start: async () => unavailable("workhorse.start"),
		snapshot: () => ({
			kind: "codex_workhorse",
			state: "unbound",
			paneId: null,
			childId: null,
			epoch: null,
			threadId: null,
			operationId: null,
			outcome: null,
			start: null,
			binding: null,
			cleanup: null,
			reason: null,
		}),
	} satisfies CodexWorkbenchWorkhorseComponents["workhorse"];
	const semanticPublisher = {
		subscribeSettledChange: () => () => undefined,
		freshBrief: () => ({
			brief: "Test task context.",
			freshness: { state: "fresh" as const, capturedAtMs: 1, freshUntilMs: 2 },
		}),
		freshBriefForRealtime: () => "Test task context.",
		dispose: () => void events.push("workhorse-publisher:dispose"),
	} satisfies CodexWorkbenchWorkhorseComponents["semanticPublisher"];
	const contextDelivery = {
		snapshot: () => ({ token: { revision: 0 }, binding: null }),
		compareAndSwap: () => unavailable("contextDelivery.compareAndSwap"),
		deliver: async () => unavailable("contextDelivery.deliver"),
		inspect: () => [],
		get: () => undefined,
		replaceHooks: () => void events.push("context:hooks"),
		childExit: async () => void events.push("context:child-exit"),
		dispose: () => void events.push("context:dispose"),
	} satisfies CodexWorkbenchWorkhorseComponents["contextDelivery"];
	const queue = {
		list: async () => unavailable("queue.list"),
		add: async () => unavailable("queue.add"),
		update: async () => unavailable("queue.update"),
		delete: async () => unavailable("queue.delete"),
		reorder: async () => unavailable("queue.reorder"),
		start: async () => unavailable("queue.start"),
		shutdown: async () => void events.push("queue:stop"),
	} satisfies CodexWorkbenchWorkhorseComponents["queue"];
	const operations = {
		inspect: async () => unavailable("operations.inspect"),
		delegate: async () => unavailable("operations.delegate"),
		manageQueue: async () => unavailable("operations.manageQueue"),
		steer: async () => unavailable("operations.steer"),
		onNotification: () => undefined,
		subscribe: () => () => undefined,
	} satisfies CodexWorkbenchWorkhorseComponents["operations"];
	return { workhorse, semanticPublisher, contextDelivery, queue, operations };
}
