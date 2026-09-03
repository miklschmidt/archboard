import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserAccountProjectionInput,
	BrowserOwnerProjection,
	BrowserOrdinaryApprovalActions,
	BrowserWorkbenchActions,
	BrowserLeaseLedger,
	CodexQueueProjectionInput,
	CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import type { OperationId } from "../../../shared/codex-workbench-identity/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";
import type { CanvasDynamicApprovalOwner } from "./codex-workbench-approvals.js";
import { createCanvasThreadLinkActions } from "./codex-workbench-thread-links.js";
import { createCanvasCanonicalTextActions } from "./codex-workbench-text-actions.js";
import { createCanvasRealtimeActions } from "./codex-workbench-realtime-actions.js";

export interface CanvasBrowserBindingState {
	readiness: BrowserOwnerProjection["readiness"];
	account: BrowserAccountProjectionInput;
	login: BrowserOwnerProjection["login"];
	queue: CodexQueueProjectionInput;
}

function queueOwnerView(queue: readonly SessionQueuedSubmission[]): CodexQueueProjectionInput {
	return { kind: "codex_queue", submissions: queue };
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
	readonly onChange: (listener: () => void) => () => void;
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
		return result;
	};
	const issueOperation = (): OperationId => components.identity.operation.issuer.mintOperationId();
	// Kept beside the action table so every mutation returns the same browser outcome shape.
	// eslint-disable-next-line unicorn/consistent-function-scoping
	const run = async (operation: () => Promise<unknown>): Promise<BrowserActionResult> => {
		await operation();
		return { outcome: "delivered" };
	};
	const actions: BrowserWorkbenchActions = {
		account: {
			read: async () => {
				const result = await components.session.accountRead();
				state.account = { kind: "codex_account_response", response: result };
				state.readiness =
					result.account === null
						? { kind: "readiness", state: "signed_out" }
						: { kind: "readiness", state: "thread_capable" };
				if (components.workhorse.snapshot().state === "ready")
					updateQueue(await components.queue.list());
				return { outcome: "delivered" };
			},
			login: async (command) => {
				const result = await components.session.accountLogin(command.login);
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
					state.readiness = {
						kind: "readiness",
						state: "login_pending",
						loginId: result.loginId,
					};
				}
				return { outcome: "delivered" };
			},
			loginCancel: (command) =>
				run(async () => {
					await components.session.accountLoginCancel({ loginId: command.loginId });
					state.login = { kind: "login", state: "cancelled", loginId: command.loginId };
				}),
			logout: () =>
				run(async () => {
					await components.session.accountLogout();
					state.account = { kind: "account", state: "signed_out" };
					state.readiness = { kind: "readiness", state: "signed_out" };
				}),
		},
		threadLinks: createCanvasThreadLinkActions({
			workhorse: components.workhorse,
			threadLink: components.threadLink,
			semanticDelivery: components.semanticDelivery,
			epoch: components.epoch,
			identity: components.identity,
			checkoutRoot: input.checkoutRoot,
		}),
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
	const projection = {
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
			return {
				readiness: state.readiness,
				account: state.account,
				login: state.login,
				timeline: null,
				queue: state.queue,
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
	};
	return { projection, actions, leaseLedger: input.leaseLedger };
}
