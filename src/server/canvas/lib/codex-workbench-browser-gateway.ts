import type {
	BrowserActionContext,
	BrowserActionResult,
	BrowserProjection,
	BrowserOrdinaryApprovalActions,
	BrowserWorkbenchActions,
	BrowserLeaseLedger,
	CodexWorkbenchGatewayOptions,
} from "../../codex-workbench/index.js";
import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import {
	createCodexBrowserModel,
	type BrowserQueue,
} from "../../../shared/codex-browser-model/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import type { OperationId } from "../../../shared/codex-workbench-identity/index.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";
import type { CanvasDynamicApprovalOwner } from "./codex-workbench-approvals.js";
import { createCanvasThreadLinkActions } from "./codex-workbench-thread-links.js";
import { createCanvasCanonicalTextActions } from "./codex-workbench-text-actions.js";
import { createCanvasRealtimeActions } from "./codex-workbench-realtime-actions.js";

export interface CanvasBrowserBindingState {
	readiness: BrowserProjection["readiness"];
	account: BrowserProjection["account"];
	login: BrowserProjection["login"];
	queue: BrowserQueue;
}

/** Bind all seven ordinary approval families to one exact pane lifecycle. */
export function createCanvasOrdinaryApprovalActions(
	approvals: CodexApprovalBroker,
): BrowserOrdinaryApprovalActions {
	const actions: BrowserOrdinaryApprovalActions = {
		pending: (requestId) => {
			try {
				return approvals.toBrowserApproval(requestId);
			} catch {
				return null;
			}
		},
		resolve: async (command) => {
			await approvals.resolve({
				requestId: command.requestId,
				approvalId: command.approvalId,
				response: command.response,
			});
			return { outcome: "delivered" };
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
				pending.map((snapshot) => approvals.cancel(snapshot.requestId, authoredReason)),
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
	const model = createCodexBrowserModel(components.identity);
	const queueProjection = (queue: readonly SessionQueuedSubmission[]): BrowserQueue =>
		model.BrowserQueueSchema.parse({
			kind: "queue",
			status: queue.length === 0 ? "empty" : "queued",
			entries: queue.map((entry) => {
				const textInput = entry.input.find((item) => item.type === "text");
				return {
					submissionId: entry.id,
					prompt: textInput?.type === "text" ? textInput.text : "[non-text input]",
					status: "queued",
					operationId: null,
				};
			}),
		});
	const updateQueue = <Result extends { readonly queue: readonly SessionQueuedSubmission[] }>(
		result: Result,
	): Result => {
		state.queue = queueProjection(result.queue);
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
				state.account =
					result.account === null
						? { kind: "account", state: "signed_out" }
						: { kind: "account", state: "ready", accountType: result.account.type };
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
		): BrowserProjection => {
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
								model.BrowserSettingsSchema.parse({
									kind: "settings",
									owner: "workhorse",
									model: workhorse.start.model,
									effort: null,
									serviceTier: workhorse.start.serviceTier,
									approvalPolicy: workhorse.start.approvalPolicy,
									approvalsReviewer: workhorse.start.approvalsReviewer,
									sandboxPolicy: workhorse.start.sandbox,
									activePermissionProfile: workhorse.start.activePermissionProfile,
								}),
							]),
					...(coordinator.effective === null ||
					coordinator.approvalPolicy === null ||
					coordinator.approvalsReviewer === null ||
					coordinator.sandboxPolicy === null
						? []
						: [
								model.BrowserSettingsSchema.parse({
									kind: "settings",
									owner: "coordinator",
									model: coordinator.effective.model,
									effort: coordinator.effective.effort,
									serviceTier: coordinator.effective.serviceTier,
									approvalPolicy: coordinator.approvalPolicy,
									approvalsReviewer: coordinator.approvalsReviewer,
									sandboxPolicy: coordinator.sandboxPolicy,
									activePermissionProfile: coordinator.activePermissionProfile,
								}),
							]),
				],
				approvals: components.approvals
					.inspect()
					.flatMap((approval) =>
						approval.state === "pending"
							? [components.approvals.toBrowserApproval(approval.requestId)]
							: [],
					),
				dynamicApprovals: dynamicApprovals.browser.pending(),
				semantic:
					semantic?.targetThreadId === undefined ||
					semantic.targetThreadId === null ||
					freshSemantic === null
						? null
						: {
								kind: "semantic_delivery",
								threadId: semantic.targetThreadId,
								delivery: semantic.outcome,
								capturedAtMs: freshSemantic.freshness.capturedAtMs,
								freshUntilMs: freshSemantic.freshness.freshUntilMs,
								reason: semantic.reason,
							},
				coordinator: {
					kind: "coordinator",
					state: coordinator.state === "inspect_only" ? "failed" : coordinator.state,
					threadId: coordinator.threadId,
					activeTurnId: null,
					model: coordinator.effective?.model ?? null,
					effort: coordinator.effective?.effort ?? null,
					serviceTier: coordinator.effective?.serviceTier ?? null,
					reason: coordinator.reason,
				},
				voice: model.BrowserVoiceSchema.parse({
					kind: "voice",
					state: !context.mediaReady
						? "unavailable"
						: realtimeGeneration !== null
							? "active"
							: coordinator.state === "ready"
								? "ready"
								: "unavailable",
					realtimeSessionId: context.mediaReady
						? (realtimeGeneration?.browserSessionId ?? null)
						: null,
					transcript: components.realtime.transcript().map((record) => ({
						itemId: record.itemId,
						sequence: record.sequence,
						speaker: record.role,
						text: record.text,
						final: record.status === "final",
					})),
					delivery: null,
					reason: context.mediaReady ? null : "Browser audio is unavailable for this socket.",
				}),
			};
		},
		onChange: input.onChange,
	};
	return { projection, actions, leaseLedger: input.leaseLedger };
}
