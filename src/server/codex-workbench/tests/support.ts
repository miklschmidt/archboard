import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	DynamicApprovalOwnerView,
	BrowserOwnerProjection,
	BrowserReadiness,
	BrowserWorkbenchActions,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserDisconnectReason,
	BrowserLifecyclePort,
	CodexWorkbenchGateway,
} from "../index.js";
import { createCodexWorkbenchGateway } from "../index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	ThreadId,
	TurnId,
	BrowserCommandId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "../../../runtime/codex-thread-link/index.js";
import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import { commandApprovalOwnerFixture } from "./approval-owner-fixture.js";
import {
	CLOCK_START,
	bindingFor,
	executableLink,
	readinessFor,
	readyAccount,
} from "./support-values.js";

export { commandTarget } from "./support-values.js";

export interface GatewayHarness {
	readonly authorities: IdentityAuthorities;
	readonly model: ReturnType<typeof createCodexBrowserModel>;
	readonly gateway: CodexWorkbenchGateway;
	readonly browserId: string;
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly calls: string[];
	readonly disconnects: string[];
	readonly disconnectReasons: BrowserDisconnectReason[];
	readonly disconnectSettled: string[];
	readonly durableDisconnects: string[];
	readonly publishedAcknowledgements: string[];
	readonly durableState: () => {
		readonly semanticBound: boolean;
		readonly realtimeActive: boolean;
	};
	readonly advance: (milliseconds: number) => void;
	readonly setReadiness: (state: BrowserReadiness["state"]) => void;
	readonly setLink: (link: ThreadLinkSnapshot) => void;
	readonly setOrdinaryApproval: (approval: ApprovalOwnerView | null, notify?: boolean) => void;
	readonly setDynamicApprovals: (approvals: readonly DynamicApprovalOwnerView[]) => void;
	readonly emitProjectionChange: () => void;
	readonly setActionError: (error: unknown) => void;
	readonly setActionResult: (result: BrowserActionResult | undefined) => void;
	readonly setActionGate: (gate: Promise<BrowserActionResult> | null) => void;
	readonly setOrdinaryDisconnectGate: (gate: Promise<void> | null) => void;
	readonly setDynamicDisconnectGate: (gate: Promise<void> | null) => void;
	readonly setOrdinaryDisconnectError: (error: unknown) => void;
	readonly setDynamicDisconnectError: (error: unknown) => void;
	readonly binding: () => ThreadLinkBindingSnapshot;
	readonly makeOrdinaryApproval: (targetThreadId?: ThreadId) => ApprovalOwnerView;
	readonly makeDynamicApproval: (
		commandId: BrowserCommandId,
		targetThreadId?: ThreadId,
	) => DynamicApprovalOwnerView;
}

export interface GatewayHarnessOptions {
	readonly snapshotMaxBytes?: number;
	readonly project?: (projection: BrowserOwnerProjection) => BrowserOwnerProjection;
}

export function createGatewayHarness(
	authorities: IdentityAuthorities = createIdentityAuthorities(),
	lifecycle?: BrowserLifecyclePort,
	onProjectionDisconnect?: BrowserProjectionPort["onBrowserDisconnect"],
	options: GatewayHarnessOptions = {},
): GatewayHarness {
	const model = createCodexBrowserModel(authorities);
	const childId = model.ChildIdSchema.parse(authorities.identity.validator.childId);
	const epoch = model.ChildEpochSchema.parse(authorities.identity.validator.epoch);
	const threadId = model.ThreadIdSchema.parse(
		authorities.identity.decoder.adoptThreadId("gateway-thread"),
	);
	const turnId = model.TurnIdSchema.parse(authorities.identity.decoder.adoptTurnId("gateway-turn"));
	const loginId = model.LoginIdSchema.parse(
		authorities.identity.decoder.adoptLoginId("gateway-login"),
	);
	const requestId = model.JsonRpcRequestIdSchema.parse(
		authorities.identity.decoder.adoptJsonRpcRequestId("gateway-request"),
	);
	const itemId = model.ItemIdSchema.parse(authorities.identity.decoder.adoptItemId("gateway-item"));
	const approvalId = model.ApprovalIdSchema.parse(
		authorities.identity.decoder.adoptApprovalId("gateway-approval"),
	);
	const browserId = "browser-one";
	const paneId = "pane-one";
	let clock = CLOCK_START;
	let readiness: BrowserReadiness = readinessFor("thread_capable", loginId);
	let account: BrowserOwnerProjection["account"] = readyAccount();
	let link: ThreadLinkSnapshot = executableLink(childId, epoch, threadId);
	let revision = 0;
	let ordinaryApproval: ApprovalOwnerView | null = null;
	let dynamicApprovals: readonly DynamicApprovalOwnerView[] = [];
	let actionError: unknown = null;
	let actionResult: BrowserActionResult | undefined;
	let actionGate: Promise<BrowserActionResult> | null = null;
	let ordinaryDisconnectGate: Promise<void> | null = null;
	let dynamicDisconnectGate: Promise<void> | null = null;
	let ordinaryDisconnectError: unknown = null;
	let dynamicDisconnectError: unknown = null;
	const calls: string[] = [];
	const disconnects: string[] = [];
	const disconnectReasons: BrowserDisconnectReason[] = [];
	const disconnectSettled: string[] = [];
	const durableDisconnects: string[] = [];
	const publishedAcknowledgements: string[] = [];
	let semanticBound = true;
	let realtimeActive = false;
	const projectionListeners = new Set<() => void>();

	const run = async (name: string): Promise<BrowserActionResult> => {
		calls.push(name);
		if (actionError !== null) throw actionError;
		if (actionGate !== null) return actionGate;
		return actionResult;
	};
	const action =
		(name: string) =>
		async (..._args: readonly unknown[]): Promise<BrowserActionResult> =>
			run(name);
	const settleDisconnect = async (
		name: string,
		gate: Promise<void> | null,
		error: unknown,
	): Promise<void> => {
		if (gate !== null) await gate;
		if (error !== null) throw error;
		disconnectSettled.push(name);
	};
	const actions: BrowserWorkbenchActions = {
		account: {
			read: action("account.read"),
			login: action("account.login"),
			loginCancel: action("account.loginCancel"),
			logout: action("account.logout"),
		},
		threadLinks: {
			create: action("threadLink.create"),
			refresh: action("threadLink.refresh"),
			attach: action("threadLink.attach"),
			relink: action("threadLink.relink"),
			onBrowserDisconnect: (context, reason) => {
				durableDisconnects.push(`semantic:${reason}`);
				if (context.linkRevision === revision) semanticBound = false;
			},
		},
		text: {
			start: action("text.start"),
			steer: action("text.steer"),
			interrupt: action("text.interrupt"),
		},
		queue: {
			add: action("queue.add"),
			update: action("queue.update"),
			delete: action("queue.delete"),
			reorder: action("queue.reorder"),
			start: action("queue.start"),
		},
		realtime: {
			start: async (..._args) => {
				const result = await run("realtime.start");
				realtimeActive = true;
				return result;
			},
			appendText: action("realtime.appendText"),
			stop: async (..._args) => {
				const result = await run("realtime.stop");
				realtimeActive = false;
				return result;
			},
			onBrowserDisconnect: (_context, reason) => {
				durableDisconnects.push(`realtime:${reason}`);
				realtimeActive = false;
			},
		},
		ordinaryApprovals: {
			pending: (candidate) =>
				candidate === requestId && ordinaryApproval?.snapshot.state === "pending"
					? ordinaryApproval
					: null,
			resolve: async () => {
				const result = await run("approval.resolve");
				if (ordinaryApproval !== null)
					ordinaryApproval = {
						...ordinaryApproval,
						snapshot: {
							...ordinaryApproval.snapshot,
							state: "settled",
							decision: "approved",
							outcome: "delivered",
							reason: "The approval settled.",
						},
						spoken: { eligible: false, reason: "not_pending" },
					};
				return result;
			},
			acknowledge: (candidate) => {
				if (candidate === requestId) ordinaryApproval = null;
			},
			unpresentedTerminals: () =>
				ordinaryApproval?.terminalDelivery === "after_publish" ? [requestId] : [],
			acknowledgePublished: (candidates) => {
				publishedAcknowledgements.push(...candidates);
				if (
					ordinaryApproval?.terminalDelivery === "after_publish" &&
					candidates.includes(requestId)
				)
					ordinaryApproval = null;
			},
			onBrowserDisconnect: (context, reason) => {
				disconnects.push("ordinary");
				disconnectReasons.push(reason);
				if (context.linkRevision === revision && ordinaryApproval?.snapshot.state === "pending")
					ordinaryApproval = null;
				return settleDisconnect("ordinary", ordinaryDisconnectGate, ordinaryDisconnectError);
			},
		},
		dynamicApprovals: {
			resolve: async (..._args) => {
				const result = await run("dynamic.resolve");
				dynamicApprovals = [];
				return result;
			},
			onBrowserDisconnect: (_context, reason) => {
				disconnects.push("dynamic");
				disconnectReasons.push(reason);
				dynamicApprovals = [];
				return settleDisconnect("dynamic", dynamicDisconnectGate, dynamicDisconnectError);
			},
		},
	};
	const projection: BrowserProjectionPort = {
		read: ({ mediaReady }): BrowserOwnerProjection => {
			const owner: BrowserOwnerProjection = {
				readiness,
				threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
				account,
				login: { kind: "login", state: "idle" },
				timeline: null,
				queue: { kind: "codex_queue", submissions: [] },
				settings: [],
				approvals: ordinaryApproval === null ? [] : [ordinaryApproval],
				dynamicApprovals,
				semantic: { kind: "codex_semantic", outcome: null, freshness: null },
				coordinator: {
					kind: "codex_coordinator",
					state: "unbound",
					threadId: null,
					configured: null,
					effective: null,
					reason: null,
				},
				voice: {
					kind: "codex_voice",
					mediaReady,
					generation: null,
					coordinatorState: "ready",
					transcript: [],
				},
			};
			return options.project?.(owner) ?? owner;
		},
		onChange: (listener) => {
			projectionListeners.add(listener);
			return () => projectionListeners.delete(listener);
		},
		onBrowserDisconnect: onProjectionDisconnect,
	};
	const threadLink = { read: (pane: string) => bindingFor(pane, revision, link) };
	const gateway = createCodexWorkbenchGateway({
		identity: authorities,
		projection,
		threadLink,
		actions,
		lifecycle,
		snapshotMaxBytes: options.snapshotMaxBytes,
		now: () => clock,
	});

	const emitProjectionChange = (): void => {
		for (const listener of projectionListeners) listener();
	};
	const setReadiness = (state: BrowserReadiness["state"]): void => {
		readiness = readinessFor(state, loginId);
		account =
			state === "account_ready" || state === "thread_capable"
				? readyAccount()
				: { kind: "account", state: "signed_out" };
		emitProjectionChange();
	};
	const setLink = (next: ThreadLinkSnapshot): void => {
		link = next;
		revision += 1;
		emitProjectionChange();
	};
	const makeOrdinaryApproval = (targetThreadId = threadId): ApprovalOwnerView =>
		commandApprovalOwnerFixture({
			identity: authorities.identity,
			childId,
			epoch,
			requestId,
			threadId: targetThreadId,
			turnId,
			itemId,
			approvalId,
			nowMs: CLOCK_START,
		});
	const makeDynamicApproval = (
		commandId: BrowserCommandId,
		targetThreadId = threadId,
	): DynamicApprovalOwnerView => {
		const authority = createDynamicAuthorityTokenIssuer();
		const operationId = authorities.operation.issuer.mintOperationId();
		const identity = {
			child: childId,
			epoch,
			threadId: targetThreadId,
			turnId,
			callId: authorities.identity.decoder.adoptDynamicToolCallId("gateway-call"),
			namespace: "archboard_app",
			tool: "send_message_to_thread",
			manifestHash: "gateway-manifest",
			operationId: String(operationId),
		} as const;
		const effect = {
			tool: "send_message_to_thread",
			arguments: {
				threadId: authorities.identity.decoder.serializeCodexIdentity(targetThreadId),
				prompt: "Send one bounded message",
			},
			callerAuthority: authority.issue(),
			targetAuthority: authority.issue(),
			contextAuthority: authority.issue(),
			effectiveBoundary: null,
			mutationOperationId: String(operationId),
			initialTurnOperationId: null,
			visualSummary: "Send one bounded message",
		} as const;
		const request: DynamicToolApprovalRequest = {
			identity,
			effect,
			effectHash: `sha256:${"7".repeat(64)}`,
			createdAtMs: CLOCK_START,
			expiresAtMs: CLOCK_START + 90_000,
		};
		return {
			request,
			binding: { commandId, paneId, capturedLink: { threadId: targetThreadId, childId, epoch } },
		};
	};

	return {
		authorities,
		model,
		gateway,
		browserId,
		paneId,
		childId,
		epoch,
		threadId,
		turnId,
		calls,
		disconnects,
		disconnectReasons,
		disconnectSettled,
		durableDisconnects,
		publishedAcknowledgements,
		durableState: () => ({ semanticBound, realtimeActive }),
		advance: (milliseconds) => {
			clock += milliseconds;
		},
		setReadiness,
		setLink,
		setOrdinaryApproval: (approval, notify = true) => {
			ordinaryApproval = approval;
			if (notify) emitProjectionChange();
		},
		setDynamicApprovals: (approvals) => {
			dynamicApprovals = approvals;
			emitProjectionChange();
		},
		emitProjectionChange,
		setActionError: (error) => {
			actionError = error;
		},
		setActionResult: (result) => {
			actionResult = result;
		},
		setActionGate: (gate) => {
			actionGate = gate;
		},
		setOrdinaryDisconnectGate: (gate) => {
			ordinaryDisconnectGate = gate;
		},
		setDynamicDisconnectGate: (gate) => {
			dynamicDisconnectGate = gate;
		},
		setOrdinaryDisconnectError: (error) => {
			ordinaryDisconnectError = error;
		},
		setDynamicDisconnectError: (error) => {
			dynamicDisconnectError = error;
		},
		binding: () => bindingFor(paneId, revision, link),
		makeOrdinaryApproval,
		makeDynamicApproval,
	};
}
