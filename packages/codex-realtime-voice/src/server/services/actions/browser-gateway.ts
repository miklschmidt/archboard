import { CodexWorkbenchGatewayError } from "#server/protocol/gateway/contract.ts";
import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserRealtimeActions,
	BrowserWorkbenchActions,
	CodexWorkbenchGatewayOptions,
} from "#server/protocol/gateway/contract.ts";
import type { BrowserLeaseLedger } from "#server/protocol/gateway/contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { SessionQueuedSubmission } from "@archboard/codex-app-server/session";
import type { OperationId, ThreadId } from "@archboard/codex-app-server/identity";
import { CODEX_SESSION_MS } from "@archboard/timing";
import type {
	WorkbenchExecutionContext,
	WorkbenchContextCodec,
} from "#runtime/protocol/host/context.ts";
import type { CodexWorkbenchSharedComponents } from "#server/services/generation/lifecycle.ts";
import type {
	CodexWorkbenchSessions,
	CodexWorkbenchTabSession,
	CodexWorkbenchWorkhorse,
} from "#server/services/sessions/sessions.ts";
import type { WorkbenchDomainApprovals } from "#server/protocol/projection/domain-approvals.ts";
import type { BrowserVoicePresentation } from "#shared/schemas/browser/snapshot.ts";
import type {
	ServerBrowserProjectionBudget,
	ServerTimelineOwner,
} from "#server/projections/timeline/timeline.ts";
import { createServerCanonicalTextActions } from "#server/services/actions/text-actions.ts";
import { createServerBrowserAccountOwner } from "#server/services/actions/account.ts";
import { watchTranscriptChanges } from "#server/services/voice/transcript-changes.ts";
import type { ServerReadinessProcessFacts } from "#server/rules/generation/readiness.ts";
import { createServerOrdinaryApprovalActions } from "#server/services/actions/ordinary-approvals.ts";
import {
	queueOwnerView,
	UNAVAILABLE_QUEUE,
	type ServerBrowserBindingState,
} from "#server/projections/browser-state/binding-state.ts";
import { readBrowserOwnerProjection } from "#server/projections/browser-state/owner-projection.ts";

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
interface ServerBrowserGatewayInput {
	readonly components: CodexWorkbenchSharedComponents;
	readonly sessions: Pick<CodexWorkbenchSessions, "require" | "list" | "onChange">;
	readonly dynamicApprovals: WorkbenchDomainApprovals | null;
	/** Host presentation facts for the active voice session. */
	readonly recording?: (presentation: BrowserVoicePresentation | null) => boolean;
	readonly state: ServerBrowserBindingState;
	readonly leaseLedger: BrowserLeaseLedger;
	readonly timeline: ServerTimelineOwner;
	readonly coordinatorTimeline: ServerTimelineOwner;
	readonly budget: ServerBrowserProjectionBudget;
	readonly onChange: (listener: () => void) => () => void;
	readonly onAccountNotification: (
		listener: (event: TransportServerNotification) => void,
	) => () => void;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => ServerReadinessProcessFacts;
	/** The name the workhorse list shows for a checkout. */
	readonly checkoutLabel: (checkout: string) => string;
	/** Injectable clock for the authoritative re-read floor. */
	readonly now?: () => number;
	readonly contextCodec: WorkbenchContextCodec;
	readonly contextForOperation: (
		context: BrowserActionContext,
		operation: {
			readonly id: string;
			readonly kind: "composer_message";
			readonly rpc: "turn/start" | "turn/steer";
		},
	) => WorkbenchExecutionContext;
}

/**
 * Forget a workhorse's cached queue, so no pane is shown another link's submissions.
 * @param workhorse The workhorse.
 */
function clearQueue(workhorse: CodexWorkbenchWorkhorse): void {
	workhorse.state.queue = UNAVAILABLE_QUEUE;
	workhorse.state.queueThreadId = null;
}

/**
 * Hear when any live tab session's voice transcript changed, including sessions that open later.
 * @param sessions The tab sessions.
 * @param listener Told once for every burst of transcript events.
 * @returns How to stop listening.
 */
function watchSessionTranscripts(
	sessions: ServerBrowserGatewayInput["sessions"],
	listener: () => void,
): () => void {
	const watched = new Map<CodexWorkbenchTabSession, () => void>();
	/** Watch every live session not watched yet, and stop watching every session that ended. */
	const watchOpen = (): void => {
		const open = sessions.list();
		for (const [session, stop] of watched) {
			if (!open.includes(session)) {
				stop();
				watched.delete(session);
			}
		}
		for (const session of open) {
			if (!watched.has(session)) {
				watched.set(session, watchTranscriptChanges(session.components.realtime, listener));
			}
		}
	};
	watchOpen();
	const unsubscribe = sessions.onChange(watchOpen);
	return () => {
		unsubscribe();
		for (const stop of watched.values()) stop();
		watched.clear();
	};
}

/**
 * Closed browser projection/actions over the already-created runtime owners.
 * @param input The runtime owners, the cached facts they fill in, the pane-side
 * owners, and the clock the re-read floor is measured on.
 * @returns The projection and actions half of the gateway's options.
 */
function createServerBrowserGatewayOptions(
	input: ServerBrowserGatewayInput,
): Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink" | "checkoutOf"> {
	const { components, dynamicApprovals, state } = input;
	/**
	 * The tab session a pane's command or snapshot belongs to: its own tab's conversation.
	 * @param context The pane and the tab session it names.
	 * @param context.tabSessionId The tab session.
	 * @returns The session.
	 */
	const sessionOf = (context: { readonly tabSessionId: TabSessionId }): CodexWorkbenchTabSession =>
		input.sessions.require(context.tabSessionId);
	/**
	 * The workhorse a pane's command is for: the one of its tab session for the checkout the tab
	 * shows (ADR 0050), built the first time a pane asks for it.
	 * @param context The pane, its tab session and its checkout.
	 * @param context.tabSessionId The tab session.
	 * @param context.checkout The checkout the pane's tab shows.
	 * @returns The workhorse.
	 */
	const workhorseOf = (context: {
		readonly tabSessionId: TabSessionId;
		readonly checkout: string;
	}): CodexWorkbenchWorkhorse => sessionOf(context).workhorse(context.checkout);
	/**
	 * Record one authoritative listing as the queue a workhorse's link is on.
	 * @param workhorse The workhorse.
	 * @param result What the queue port answered.
	 * @returns That same result, so a caller can go on using it.
	 */
	const updateQueue = <Result extends { readonly queue: readonly SessionQueuedSubmission[] }>(
		workhorse: CodexWorkbenchWorkhorse,
		result: Result,
	): Result => {
		workhorse.state.queue = queueOwnerView(result.queue, components.identity.operation);
		workhorse.state.queueThreadId = workhorse.components.workhorse.snapshot().threadId;
		return result;
	};
	/**
	 * A fresh operation identity for one browser-initiated mutation.
	 * @returns The operation.
	 */
	const issueOperation = (): OperationId => components.identity.operation.issuer.mintOperationId();
	/**
	 * Read the queue for the link a workhorse has just moved to.
	 *
	 * A thread link change re-targets every queue: the cached submissions belong
	 * to the previous thread and must not be presented for the new one.
	 * @param workhorse The workhorse.
	 */
	const refreshLinkedQueue = async (workhorse: CodexWorkbenchWorkhorse): Promise<void> => {
		clearQueue(workhorse);
		if (workhorse.components.workhorse.snapshot().state !== "ready") {
			return;
		}
		try {
			updateQueue(workhorse, await workhorse.components.queue.list());
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
	 * @param workhorse The workhorse.
	 */
	const rereadLinkedQueue = async (workhorse: CodexWorkbenchWorkhorse): Promise<void> => {
		if (workhorse.components.workhorse.snapshot().state !== "ready") {
			clearQueue(workhorse);
			return;
		}
		try {
			updateQueue(workhorse, await workhorse.components.queue.list());
		} catch {
			// The read failed, so nothing about the cache is proven: the browser is
			// told the queue is unavailable rather than shown an unverified list.
			clearQueue(workhorse);
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
	 * @param workhorse The workhorse whose queue is read.
	 * @param threadId The link's thread.
	 * @returns The read this request is served by.
	 */
	const coalescedReread = (
		workhorse: CodexWorkbenchWorkhorse,
		threadId: ThreadId,
	): Promise<void> => {
		if (inFlightReread?.threadId === threadId) {
			return inFlightReread.read;
		}
		if (
			lastRereadAtMs?.threadId === threadId &&
			now() - lastRereadAtMs.atMs < CODEX_SESSION_MS.queueRereadFloor
		) {
			return Promise.resolve();
		}
		const read = rereadLinkedQueue(workhorse).finally(() => {
			lastRereadAtMs = { threadId, atMs: now() };
			if (inFlightReread?.threadId === threadId) {
				inFlightReread = null;
			}
		});
		inFlightReread = { threadId, read };
		return read;
	};
	const account = createServerBrowserAccountOwner({
		components,
		state,
		/** Sign-out drops every workhorse's queue with the account it belonged to. */
		clearQueue: () => {
			for (const session of input.sessions.list()) {
				for (const workhorse of session.workhorses.values()) clearQueue(workhorse);
			}
		},
		onNotification: input.onAccountNotification,
	});
	/**
	 * Run one queue mutation for the pane's workhorse and cache the listing it answers.
	 * @param context The pane.
	 * @param mutate The mutation, given the workhorse's queue and a fresh operation.
	 * @returns The browser outcome.
	 */
	const mutateQueue = (
		context: BrowserActionContext,
		mutate: (
			queue: CodexWorkbenchWorkhorse["components"]["queue"],
			operationId: OperationId,
		) => Promise<{ readonly queue: readonly SessionQueuedSubmission[] }>,
	): Promise<BrowserActionResult> => {
		const workhorse = workhorseOf(context);
		return runMutation(
			async () =>
				void updateQueue(workhorse, await mutate(workhorse.components.queue, issueOperation())),
		);
	};
	const realtime: BrowserRealtimeActions = {
		/**
		 * Start voice in the pane's session.
		 * @param command The offer.
		 * @param context The pane.
		 * @returns What the session's voice answered.
		 */
		start: (command, context) => sessionOf(context).actions.realtime.start(command, context),
		/**
		 * Say something into the pane's session's voice.
		 * @param command The handle and the text.
		 * @param context The pane.
		 * @returns What the session's voice answered.
		 */
		appendText: (command, context) =>
			sessionOf(context).actions.realtime.appendText(command, context),
		/**
		 * Stop the pane's session's voice.
		 * @param command The handle.
		 * @param context The pane.
		 * @returns What the session's voice answered.
		 */
		stop: (command, context) => sessionOf(context).actions.realtime.stop(command, context),
		/**
		 * Stop the voice a browser that has gone was speaking through.
		 * @param context The pane and its connection.
		 * @param reason Why it went.
		 * @returns When that voice has stopped.
		 */
		onBrowserDisconnect: (context, reason) =>
			sessionOf(context).actions.realtime.onBrowserDisconnect?.(context, reason),
	};
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
				const workhorse = sessionOf(context).workhorses.get(context.checkout);
				if (workhorse?.components.workhorse.snapshot().state === "ready") {
					updateQueue(workhorse, await workhorse.components.queue.list());
				}
				return result;
			},
		},
		threadLinks: {
			/**
			 * Start a new conversation of the workhorse of the shown checkout, with the tab's
			 * coordinator, and link the panes of that checkout to it.
			 * @param command The creation.
			 * @param context The pane.
			 * @returns What the link owner answered.
			 */
			create: async (command, context) => {
				const workhorse = workhorseOf(context);
				const result = await workhorse.actions.threadLinks.create(command, context);
				await refreshLinkedQueue(workhorse);
				return result;
			},
		},
		text: createServerCanonicalTextActions({
			identity: components.identity,
			session: components.session,
			contextForOperation: input.contextForOperation,
			contextCodec: input.contextCodec,
		}),
		queue: {
			/**
			 * Queue one prompt behind whatever the workhorse is doing.
			 * @param command The prompt.
			 * @param context The pane.
			 * @returns The browser outcome.
			 */
			add: (command, context) =>
				mutateQueue(context, (queue, operationId) =>
					queue.add({ operationId, prompt: command.prompt }),
				),
			/**
			 * Rewrite one queued prompt.
			 * @param command Which submission, and its new prompt.
			 * @param context The pane.
			 * @returns The browser outcome.
			 */
			update: (command, context) =>
				mutateQueue(context, (queue, operationId) =>
					queue.update({
						operationId,
						submissionId: command.submissionId,
						prompt: command.prompt,
					}),
				),
			/**
			 * Drop one queued prompt.
			 * @param command Which submission.
			 * @param context The pane.
			 * @returns The browser outcome.
			 */
			delete: (command, context) =>
				mutateQueue(context, (queue, operationId) =>
					queue.delete({ operationId, submissionId: command.submissionId }),
				),
			/**
			 * Put the queue in the order the person dragged it into.
			 * @param command The order.
			 * @param context The pane.
			 * @returns The browser outcome.
			 */
			reorder: (command, context) =>
				mutateQueue(context, (queue, operationId) =>
					queue.reorder({ operationId, orderedSubmissionIds: command.orderedSubmissionIds }),
				),
			/**
			 * Run one queued prompt now rather than in turn.
			 * @param command Which submission.
			 * @param context The pane.
			 * @returns The browser outcome.
			 */
			start: (command, context) =>
				mutateQueue(context, (queue, operationId) =>
					queue.start({ operationId, submissionId: command.submissionId }),
				),
		},
		realtime,
		ordinaryApprovals: createServerOrdinaryApprovalActions(components.approvals),
		dynamicApprovals: dynamicApprovals?.browser ?? {
			/** Refuse a domain approval when the host supplies no approval owner. */
			resolve: async () => {
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"Domain approvals are unsupported by this workbench host.",
					{ outcome: "not_delivered" },
				);
			},
		},
	};
	const projection: BrowserProjectionPort = {
		/**
		 * Bring the queue up to date before the next snapshot is read, for a
		 * pane whose link can actually run turns.
		 * @param context The pane.
		 */
		refresh: async (context): Promise<void> => {
			const link = context.binding.link;
			const workhorse = sessionOf(context).workhorses.get(context.checkout);
			if (link.state !== "executable" || workhorse === undefined) {
				return;
			}
			await coalescedReread(workhorse, link.threadId);
		},
		/**
		 * One complete snapshot of the workbench as this pane is shown it.
		 * @param context The pane, its binding, and its lease.
		 * @returns The projection.
		 */
		read: (context) =>
			readBrowserOwnerProjection(
				{
					approvals: components.approvals,
					checkoutLabel: input.checkoutLabel,
					session: sessionOf(context),
					workhorse: sessionOf(context).workhorses.get(context.checkout) ?? null,
					dynamicApprovals,
					...(input.recording === undefined ? {} : { recording: input.recording }),
					state,
					timeline: input.timeline,
					coordinatorTimeline: input.coordinatorTimeline,
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
			const unsubscribeTranscript = watchSessionTranscripts(input.sessions, listener);
			return () => {
				unsubscribeTranscript();
				unsubscribeAccount();
				unsubscribe();
			};
		},
		/**
		 * Forget the timelines retained for a pane whose browser has gone.
		 * @param disconnect What disconnected.
		 * @param disconnect.paneId The pane.
		 * @param disconnect.connection Its browser connection.
		 */
		onBrowserDisconnect: ({ paneId, connection }) => {
			input.timeline.retire(paneId, connection);
			input.coordinatorTimeline.retire(paneId, connection);
		},
	};
	return {
		projection,
		actions,
		leaseLedger: input.leaseLedger,
		snapshotMaxBytes: input.budget.maxBytes,
	};
}

export {
	type ServerBrowserGatewayInput,
	createServerBrowserGatewayOptions,
	createServerOrdinaryApprovalActions,
	type ServerBrowserBindingState,
};
