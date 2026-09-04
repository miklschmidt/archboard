import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserAccountProjectionInput,
	BrowserOwnerProjection,
	BrowserProjectionPort,
	BrowserOrdinaryApprovalActions,
	BrowserWorkbenchActions,
	BrowserLeaseLedger,
	CodexQueueProjectionInput,
	CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import type { OperationId, ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";
import type { CanvasDynamicApprovalOwner } from "./codex-workbench-approvals.js";
import type {
	CanvasBrowserProjectionBudget,
	CanvasTimelineOwner,
} from "./codex-workbench-timeline.js";
import { createCanvasThreadLinkActions } from "./codex-workbench-thread-links.js";
import { createCanvasCanonicalTextActions } from "./codex-workbench-text-actions.js";
import { createCanvasRealtimeActions } from "./codex-workbench-realtime-actions.js";
import {
	boundedBrowserReason,
	projectCanvasBrowserReadiness,
	type CanvasReadinessProcessFacts,
} from "./codex-workbench-readiness.js";

/**
 * The account, login, and queue facts this adapter learns from its own command
 * results. Readiness is never stored: it is derived from the live owned
 * process, session, account, and coordinator facts on every projection read.
 */
export interface CanvasBrowserBindingState {
	account: BrowserAccountProjectionInput;
	login: BrowserOwnerProjection["login"];
	queue: CodexQueueProjectionInput;
	/** The workhorse thread the cached submissions were read for. */
	queueThreadId: ThreadId | null;
}

const UNAVAILABLE_QUEUE: CodexQueueProjectionInput = { kind: "codex_queue", submissions: null };

function queueOwnerView(queue: readonly SessionQueuedSubmission[]): CodexQueueProjectionInput {
	return { kind: "codex_queue", submissions: queue };
}

function failureReason(error: unknown, fallback: string): string {
	return boundedBrowserReason(error instanceof Error ? error.message : null, fallback);
}

function visibleApprovalViews(approvals: CodexApprovalBroker) {
	return approvals
		.inspectViews()
		.filter(
			(view) =>
				view.snapshot.state === "staged" ||
				view.snapshot.state === "pending" ||
				view.terminalDelivery !== null,
		);
}

/** Bind all seven ordinary approval families to one exact pane lifecycle. */
export function createCanvasOrdinaryApprovalActions(
	approvals: CodexApprovalBroker,
): BrowserOrdinaryApprovalActions {
	const actions: BrowserOrdinaryApprovalActions = {
		pending: (requestId) => {
			try {
				if (approvals.get(requestId)?.state !== "pending") return null;
				return approvals.view(requestId);
			} catch {
				return null;
			}
		},
		resolve: async (command) => {
			const settlement = await approvals.resolve({
				requestId: command.requestId,
				approvalId: command.approvalId,
				response: command.response,
			});
			return { outcome: settlement.outcome };
		},
		acknowledge: (requestId) => approvals.acknowledge(requestId),
		unpresentedTerminals: () =>
			approvals
				.inspectViews()
				.filter((view) => view.terminalDelivery === "after_publish")
				.map((view) => view.request.requestId),
		acknowledgePublished: (requestIds) => {
			for (const requestId of new Set(requestIds)) {
				try {
					const view = approvals.view(requestId);
					if (view.terminalDelivery === "after_publish") approvals.acknowledge(requestId);
				} catch {
					// Another lifecycle boundary may already have acknowledged the terminal.
				}
			}
		},
		onBrowserDisconnect: async (context, reason) => {
			if (context.link.state !== "executable") return;
			const authoredReason =
				reason === "gateway_shutdown"
					? "host shutdown"
					: reason === "child_disconnected"
						? "child disconnected"
						: "browser disconnected";
			const exactPaneLink = `pane:${context.paneId}`;
			const pending = approvals
				.inspect()
				.filter(
					(snapshot) =>
						snapshot.state === "pending" &&
						snapshot.child === context.childId &&
						snapshot.epoch === context.epoch &&
						snapshot.threadId === context.link.threadId &&
						snapshot.binding.link === exactPaneLink,
				);
			await Promise.all(
				pending.map(async (snapshot) => {
					await approvals.cancel(snapshot.requestId, authoredReason);
					if (approvals.get(snapshot.requestId) !== undefined)
						approvals.acknowledge(snapshot.requestId);
				}),
			);
		},
	};
	return Object.freeze(actions);
}

/** Closed browser projection/actions over the already-created runtime owners. */
export function createCanvasBrowserGatewayOptions(input: {
	readonly components: Omit<CodexWorkbenchComponents, "gateway">;
	readonly dynamicApprovals: CanvasDynamicApprovalOwner;
	readonly state: CanvasBrowserBindingState;
	readonly leaseLedger: BrowserLeaseLedger;
	readonly timeline: CanvasTimelineOwner;
	readonly budget: CanvasBrowserProjectionBudget;
	readonly onChange: (listener: () => void) => () => void;
	/** The live owned-process facts behind every child-lifecycle readiness arm. */
	readonly process: () => CanvasReadinessProcessFacts;
	readonly checkoutRoot: string;
	readonly contextForOperation: (
		context: BrowserActionContext,
		operation: {
			readonly id: string;
			readonly kind: "composer_message";
			readonly rpc: "turn/start" | "turn/steer";
		},
	) => ArchboardContext;
}): Omit<CodexWorkbenchGatewayOptions, "identity" | "threadLink"> {
	const { components, dynamicApprovals, state } = input;
	const updateQueue = <Result extends { readonly queue: readonly SessionQueuedSubmission[] }>(
		result: Result,
	): Result => {
		state.queue = queueOwnerView(result.queue);
		state.queueThreadId = components.workhorse.snapshot().threadId;
		return result;
	};
	const clearQueue = (): void => {
		state.queue = UNAVAILABLE_QUEUE;
		state.queueThreadId = null;
	};
	const issueOperation = (): OperationId => components.identity.operation.issuer.mintOperationId();
	// Kept beside the action table so every mutation returns the same browser outcome shape.
	// eslint-disable-next-line unicorn/consistent-function-scoping
	const run = async (operation: () => Promise<unknown>): Promise<BrowserActionResult> => {
		await operation();
		return { outcome: "delivered" };
	};
	// A thread link change re-targets every queue: the cached submissions belong
	// to the previous thread and must not be presented for the new one.
	const refreshLinkedQueue = async (): Promise<void> => {
		clearQueue();
		if (components.workhorse.snapshot().state !== "ready") return;
		try {
			updateQueue(await components.queue.list());
		} catch {
			// The queue stays unavailable until an owner read succeeds; the browser
			// presents that as its own state rather than another thread's entries.
		}
	};
	const threadLinks = createCanvasThreadLinkActions({
		workhorse: components.workhorse,
		threadLink: components.threadLink,
		semanticDelivery: components.semanticDelivery,
		epoch: components.epoch,
		identity: components.identity,
		checkoutRoot: input.checkoutRoot,
	});
	const actions: BrowserWorkbenchActions = {
		account: {
			read: async () => {
				let result: Awaited<ReturnType<typeof components.session.accountRead>>;
				try {
					result = await components.session.accountRead();
				} catch (error) {
					state.account = {
						kind: "account",
						state: "failed",
						reason: failureReason(error, "The Codex account could not be read."),
					};
					throw error;
				}
				state.account = { kind: "codex_account_response", response: result };
				if (result.account !== null && state.login.state === "pending")
					state.login = { kind: "login", state: "completed", loginId: state.login.loginId };
				if (components.workhorse.snapshot().state === "ready")
					updateQueue(await components.queue.list());
				return { outcome: "delivered" };
			},
			login: async (command) => {
				let result: Awaited<ReturnType<typeof components.session.accountLogin>>;
				try {
					result = await components.session.accountLogin(command.login);
				} catch (error) {
					state.login = {
						kind: "login",
						state: "failed",
						loginId: null,
						reason: failureReason(error, "The Codex sign-in failed."),
					};
					throw error;
				}
				if ("loginId" in result) {
					state.login = {
						kind: "login",
						state: "pending",
						loginId: result.loginId,
						variant: command.login.type,
					};
					state.account = {
						kind: "account",
						state: "login_pending",
						loginId: result.loginId,
						variant: command.login.type,
					};
				}
				return { outcome: "delivered" };
			},
			loginCancel: (command) =>
				run(async () => {
					await components.session.accountLoginCancel({ loginId: command.loginId });
					state.login = { kind: "login", state: "cancelled", loginId: command.loginId };
					if (state.account.kind === "account" && state.account.state === "login_pending")
						state.account = {
							kind: "account",
							state: "unknown",
							reason: "The sign-in was cancelled before an account was read.",
						};
				}),
			logout: () =>
				run(async () => {
					await components.session.accountLogout();
					state.account = { kind: "account", state: "signed_out" };
					state.login = { kind: "login", state: "idle" };
					clearQueue();
				}),
		},
		threadLinks: {
			create: async (command, context) => {
				const result = await threadLinks.create(command, context);
				await refreshLinkedQueue();
				return result;
			},
			attach: async (command, context) => {
				const result = await threadLinks.attach(command, context);
				await refreshLinkedQueue();
				return result;
			},
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
			add: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.add({ operationId: issueOperation(), prompt: command.prompt }),
						),
				),
			update: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.update({
								operationId: issueOperation(),
								submissionId: command.submissionId,
								prompt: command.prompt,
							}),
						),
				),
			delete: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.delete({
								operationId: issueOperation(),
								submissionId: command.submissionId,
							}),
						),
				),
			reorder: (command) =>
				run(
					async () =>
						void updateQueue(
							await components.queue.reorder({
								operationId: issueOperation(),
								orderedSubmissionIds: command.orderedSubmissionIds,
							}),
						),
				),
			start: (command) =>
				run(
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
		read: (
			context: Parameters<CodexWorkbenchGatewayOptions["projection"]["read"]>[0],
		): BrowserOwnerProjection => {
			if (context.lease?.state === "active")
				dynamicApprovals.bindLease(context.paneId, context.lease.commandId);
			const coordinator = components.coordinator.snapshot();
			const workhorse = components.workhorse.snapshot();
			const semantic = components.semanticDelivery.inspect().at(-1);
			const semanticBinding = components.semanticDelivery.snapshot().binding;
			const freshSemantic =
				semantic?.targetThreadId === undefined ||
				semantic.targetThreadId === null ||
				semanticBinding === null
					? null
					: components.semanticPublisher.freshBrief();
			const realtimeGeneration = components.realtime.generation();
			const readiness = projectCanvasBrowserReadiness({
				process: input.process(),
				account: state.account,
				login: state.login,
				coordinatorReady: coordinator.state === "ready",
			});
			return {
				readiness,
				account: state.account,
				login: state.login,
				timeline: input.timeline.read(
					context.paneId,
					context.binding.revision,
					context.binding.link,
					readiness.state === "thread_capable",
					context.connection,
				),
				// Cached submissions belong to one workhorse thread; a pane looking at
				// another link is told the queue is unavailable, never shown the wrong one.
				queue:
					state.queueThreadId !== null && state.queueThreadId === context.binding.link.threadId
						? state.queue
						: UNAVAILABLE_QUEUE,
				settings: [
					...(workhorse.start === null
						? []
						: [
								{
									kind: "codex_thread_settings" as const,
									owner: "workhorse" as const,
									settings: {
										model: workhorse.start.model,
										effort: null,
										serviceTier: workhorse.start.serviceTier,
										approvalPolicy: workhorse.start.approvalPolicy,
										approvalsReviewer: workhorse.start.approvalsReviewer,
										sandboxPolicy: workhorse.start.sandbox,
										activePermissionProfile: workhorse.start.activePermissionProfile,
									},
								},
							]),
					...(coordinator.effective === null ||
					coordinator.approvalPolicy === null ||
					coordinator.approvalsReviewer === null ||
					coordinator.sandboxPolicy === null
						? []
						: [
								{
									kind: "codex_thread_settings" as const,
									owner: "coordinator" as const,
									settings: {
										model: coordinator.effective.model,
										effort: coordinator.effective.effort,
										serviceTier: coordinator.effective.serviceTier,
										approvalPolicy: coordinator.approvalPolicy,
										approvalsReviewer: coordinator.approvalsReviewer,
										sandboxPolicy: coordinator.sandboxPolicy,
										activePermissionProfile: coordinator.activePermissionProfile,
									},
								},
							]),
				],
				approvals: visibleApprovalViews(components.approvals),
				dynamicApprovals: dynamicApprovals.pending(),
				semantic: {
					kind: "codex_semantic",
					outcome:
						semantic === undefined
							? null
							: {
									targetThreadId: semantic.targetThreadId,
									outcome: semantic.outcome,
									reason: semantic.reason,
								},
					freshness: freshSemantic?.freshness ?? null,
				},
				coordinator: {
					kind: "codex_coordinator",
					state: coordinator.state,
					threadId: coordinator.threadId,
					configured: coordinator.configured,
					effective: coordinator.effective,
					reason: coordinator.reason,
				},
				voice: {
					kind: "codex_voice",
					mediaReady: context.mediaReady,
					generation: realtimeGeneration,
					coordinatorState: coordinator.state,
					transcript: components.realtime.transcript(),
				},
			};
		},
		onChange: input.onChange,
		onBrowserDisconnect: ({ paneId, connection }) => input.timeline.retire(paneId, connection),
	};
	return {
		projection,
		actions,
		leaseLedger: input.leaseLedger,
		snapshotMaxBytes: input.budget.maxBytes,
	};
}
