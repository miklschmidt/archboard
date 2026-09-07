import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserWorkbenchActions,
	BrowserLeaseLedger,
	CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench";
import type { TransportServerNotification } from "@/runtime/codex-transport";
import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import type { OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import { CODEX_QUEUE_REREAD_FLOOR_MS } from "@/shared/timing/timing";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";
import type { CanvasDynamicApprovalOwner } from "@/server/canvas/lib/codex-workbench-approvals";
import type {
	CanvasBrowserProjectionBudget,
	CanvasTimelineOwner,
} from "@/server/canvas/lib/codex-workbench-timeline";
import {
	createCanvasThreadCandidateInventory,
	createCanvasThreadLinkActions,
} from "@/server/canvas/lib/codex-workbench-thread-links";
import { createCanvasCanonicalTextActions } from "@/server/canvas/lib/codex-workbench-text-actions";
import { createCanvasBrowserAccountOwner } from "@/server/canvas/lib/codex-workbench-account";
import { createCanvasRealtimeActions } from "@/server/canvas/lib/codex-workbench-realtime-actions";
import type { CanvasReadinessProcessFacts } from "@/server/canvas/lib/codex-workbench-readiness";
import { createCanvasOrdinaryApprovalActions } from "@/server/canvas/lib/codex-workbench-ordinary-approvals";
import {
	queueOwnerView,
	UNAVAILABLE_QUEUE,
	type CanvasBrowserBindingState,
} from "@/server/canvas/lib/codex-workbench-browser-state";
import { readBrowserOwnerProjection } from "@/server/canvas/lib/codex-workbench-owner-projection";

/**
 * Run one queue mutation and answer the browser the one way every mutation is
 * answered, so no action invents its own outcome shape.
 * @param operation The mutation.
 * @returns The browser outcome.
 */
async function runMutation(operation: () => Promise<unknown>): Promise<BrowserActionResult> {
	await operation();
	return { outcome: "delivered" };
}

/** Everything the browser half of one generation's gateway is closed over. */
interface CanvasBrowserGatewayInput {
	readonly components: Omit<CodexWorkbenchComponents, "gateway">;
	readonly dynamicApprovals: CanvasDynamicApprovalOwner;
	readonly state: CanvasBrowserBindingState;
	readonly leaseLedger: BrowserLeaseLedger;
	readonly timeline: CanvasTimelineOwner;
	readonly budget: CanvasBrowserProjectionBudget;
	readonly onChange: (listener: () => void) => () => void;
	readonly onAccountNotification: (
		listener: (event: TransportServerNotification) => void,
	) => () => void;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => CanvasReadinessProcessFacts;
	readonly checkoutRoot: string;
	/** Injectable clock for the authoritative re-read floor. */
	readonly now?: () => number;
	readonly contextForOperation: (
		context: BrowserActionContext,
		operation: {
			readonly id: string;
			readonly kind: "composer_message";
			readonly rpc: "turn/start" | "turn/steer";
		},
	) => ArchboardContext;
}

/**
 * Closed browser projection/actions over the already-created runtime owners.
 * @param input The runtime owners, the cached facts they fill in, the pane-side
 * owners, and the clock the re-read floor is measured on.
 * @returns The projection and actions half of the gateway's options.
 */
function createCanvasBrowserGatewayOptions(
	input: CanvasBrowserGatewayInput,
): Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink"> {
	const { components, dynamicApprovals, state } = input;
	/**
	 * Record one authoritative listing as the queue this pane's link is on.
	 * @param result What the queue port answered.
	 * @returns That same result, so a caller can go on using it.
	 */
	const updateQueue = <Result extends { readonly queue: readonly SessionQueuedSubmission[] }>(
		result: Result,
	): Result => {
		state.queue = queueOwnerView(result.queue, components.identity.operation);
		state.queueThreadId = components.workhorse.snapshot().threadId;
		return result;
	};
	/** Forget the cached queue, so no pane is shown another link's submissions. */
	const clearQueue = (): void => {
		state.queue = UNAVAILABLE_QUEUE;
		state.queueThreadId = null;
	};
	/**
	 * A fresh operation identity for one browser-initiated mutation.
	 * @returns The operation.
	 */
	const issueOperation = (): OperationId => components.identity.operation.issuer.mintOperationId();
	/**
	 * Read the queue for the link this pane has just moved to.
	 *
	 * A thread link change re-targets every queue: the cached submissions belong
	 * to the previous thread and must not be presented for the new one.
	 */
	const refreshLinkedQueue = async (): Promise<void> => {
		clearQueue();
		if (components.workhorse.snapshot().state !== "ready") {
			return;
		}
		try {
			updateQueue(await components.queue.list());
		} catch {
			// The queue stays unavailable until an owner read succeeds; the browser
			// presents that as its own state rather than another thread's entries.
		}
	};
	/**
	 * Re-read the authoritative queue for the link this pane is already on.
	 *
	 * A snapshot request is the browser asking for current state, and the cached
	 * submissions are exactly what a lost mutation or a workhorse-side drain left
	 * behind. Unlike a link change, the cache is not cleared first: a failed
	 * re-read must not present a healthy queue as somebody else's.
	 */
	const rereadLinkedQueue = async (): Promise<void> => {
		if (components.workhorse.snapshot().state !== "ready") {
			clearQueue();
			return;
		}
		try {
			updateQueue(await components.queue.list());
		} catch {
			// The read failed, so nothing about the cache is proven: the browser is
			// told the queue is unavailable rather than shown an unverified list.
			clearQueue();
		}
	};
	const now = input.now ?? Date.now;
	let inFlightReread: { readonly threadId: ThreadId; readonly read: Promise<void> } | null = null;
	let lastRereadAtMs: { readonly threadId: ThreadId; readonly atMs: number } | null = null;
	/**
	 * One authoritative re-read at a time, per thread link, no faster than the
	 * reviewed floor.
	 *
	 * A browser may ask for a snapshot as often as it likes, and each re-read is
	 * a paginated `thread/queue/list`. Concurrent requests share the one
	 * in-flight read, and a request that arrives inside the floor is served from
	 * the read that just finished — so a looping client cannot amplify app-server
	 * traffic. The floor is keyed to the link, so navigating to another workhorse
	 * always reads rather than reusing the previous link's timing.
	 * @param threadId The link's thread.
	 * @returns The read this request is served by.
	 */
	const coalescedReread = (threadId: ThreadId): Promise<void> => {
		if (inFlightReread?.threadId === threadId) {
			return inFlightReread.read;
		}
		if (
			lastRereadAtMs?.threadId === threadId &&
			now() - lastRereadAtMs.atMs < CODEX_QUEUE_REREAD_FLOOR_MS
		) {
			return Promise.resolve();
		}
		const read = rereadLinkedQueue().finally(() => {
			lastRereadAtMs = { threadId, atMs: now() };
			if (inFlightReread?.threadId === threadId) {
				inFlightReread = null;
			}
		});
		inFlightReread = { threadId, read };
		return read;
	};
	const candidates = createCanvasThreadCandidateInventory(components.threadLink, components.epoch);
	const threadLinks = createCanvasThreadLinkActions({
		candidates,
		workhorse: components.workhorse,
		threadLink: components.threadLink,
		semanticDelivery: components.semanticDelivery,
		epoch: components.epoch,
		identity: components.identity,
		checkoutRoot: input.checkoutRoot,
	});
	const account = createCanvasBrowserAccountOwner({
		components,
		state,
		clearQueue,
		onNotification: input.onAccountNotification,
	});
	const actions: BrowserWorkbenchActions = {
		account: {
			...account.actions,
			/**
			 * Read the account, and the queue with it: an account read is the one
			 * command a pane sends when it first has a workhorse to ask about.
			 * @param context The pane.
			 * @returns What the account owner answered.
			 */
			read: async (context) => {
				const result = await account.actions.read(context);
				if (components.workhorse.snapshot().state === "ready") {
					updateQueue(await components.queue.list());
				}
				return result;
			},
		},
		threadLinks: {
			/**
			 * Re-read the threads this pane could link to.
			 * @param command The refresh.
			 * @param context The pane.
			 * @returns What the link owner answered.
			 */
			refresh: (command, context) => threadLinks.refresh(command, context),
			/**
			 * Start a new workhorse thread and link this pane to it.
			 * @param command The creation.
			 * @param context The pane.
			 * @returns What the link owner answered.
			 */
			create: async (command, context) => {
				const result = await threadLinks.create(command, context);
				await refreshLinkedQueue();
				return result;
			},
			/**
			 * Link this pane to a thread that already exists.
			 * @param command The attachment.
			 * @param context The pane.
			 * @returns What the link owner answered.
			 */
			attach: async (command, context) => {
				const result = await threadLinks.attach(command, context);
				await refreshLinkedQueue();
				return result;
			},
			/**
			 * Move this pane's link to another thread.
			 * @param command The relink.
			 * @param context The pane.
			 * @returns What the link owner answered.
			 */
			relink: async (command, context) => {
				const result = await threadLinks.relink(command, context);
				await refreshLinkedQueue();
				return result;
			},
			...(threadLinks.onBrowserDisconnect === undefined
				? {}
				: { onBrowserDisconnect: threadLinks.onBrowserDisconnect }),
		},
		text: createCanvasCanonicalTextActions({
			identity: components.identity,
			session: components.session,
			contextForOperation: input.contextForOperation,
		}),
		queue: {
			/**
			 * Queue one prompt behind whatever the workhorse is doing.
			 * @param command The prompt.
			 * @returns The browser outcome.
			 */
			add: (command) =>
				runMutation(
					async () =>
						void updateQueue(
							await components.queue.add({ operationId: issueOperation(), prompt: command.prompt }),
						),
				),
			/**
			 * Rewrite one queued prompt.
			 * @param command Which submission, and its new prompt.
			 * @returns The browser outcome.
			 */
			update: (command) =>
				runMutation(
					async () =>
						void updateQueue(
							await components.queue.update({
								operationId: issueOperation(),
								submissionId: command.submissionId,
								prompt: command.prompt,
							}),
						),
				),
			/**
			 * Drop one queued prompt.
			 * @param command Which submission.
			 * @returns The browser outcome.
			 */
			delete: (command) =>
				runMutation(
					async () =>
						void updateQueue(
							await components.queue.delete({
								operationId: issueOperation(),
								submissionId: command.submissionId,
							}),
						),
				),
			/**
			 * Put the queue in the order the person dragged it into.
			 * @param command The order.
			 * @returns The browser outcome.
			 */
			reorder: (command) =>
				runMutation(
					async () =>
						void updateQueue(
							await components.queue.reorder({
								operationId: issueOperation(),
								orderedSubmissionIds: command.orderedSubmissionIds,
							}),
						),
				),
			/**
			 * Run one queued prompt now rather than in turn.
			 * @param command Which submission.
			 * @returns The browser outcome.
			 */
			start: (command) =>
				runMutation(
					async () =>
						void updateQueue(
							await components.queue.start({
								operationId: issueOperation(),
								submissionId: command.submissionId,
							}),
						),
				),
		},
		realtime: createCanvasRealtimeActions(components),
		ordinaryApprovals: createCanvasOrdinaryApprovalActions(components.approvals),
		dynamicApprovals: dynamicApprovals.browser,
	};
	const projection: BrowserProjectionPort = {
		/**
		 * Bring the queue up to date before the next snapshot is read, for a
		 * pane whose link can actually run turns.
		 * @param context The pane.
		 */
		refresh: async (context): Promise<void> => {
			const link = context.binding.link;
			if (link.state !== "executable") {
				return;
			}
			await coalescedReread(link.threadId);
		},
		/**
		 * One complete snapshot of the workbench as this pane is shown it.
		 * @param context The pane, its binding, and its lease.
		 * @returns The projection.
		 */
		read: (context) =>
			readBrowserOwnerProjection(
				{
					components,
					dynamicApprovals,
					state,
					candidates,
					timeline: input.timeline,
					process: input.process,
				},
				context,
			),
		/**
		 * Say when anything a snapshot is read from has changed.
		 * @param listener What to call.
		 * @returns How to stop listening.
		 */
		onChange: (listener) => {
			const unsubscribe = input.onChange(listener);
			const unsubscribeAccount = account.subscribe(listener);
			return () => {
				unsubscribeAccount();
				unsubscribe();
			};
		},
		/**
		 * Forget the timeline retained for a pane whose browser has gone.
		 * @param disconnect What disconnected.
		 * @param disconnect.paneId The pane.
		 * @param disconnect.connection Its browser connection.
		 * @returns Nothing the gateway waits on.
		 */
		onBrowserDisconnect: ({ paneId, connection }) => input.timeline.retire(paneId, connection),
	};
	return {
		projection,
		actions,
		leaseLedger: input.leaseLedger,
		snapshotMaxBytes: input.budget.maxBytes,
	};
}

export {
	createCanvasBrowserGatewayOptions,
	createCanvasOrdinaryApprovalActions,
	type CanvasBrowserBindingState,
};
