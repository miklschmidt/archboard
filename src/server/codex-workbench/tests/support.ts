import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserDynamicApproval,
	BrowserOwnerProjection,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserWorkbenchActions,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserGatewayMessage,
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

const CLOCK_START = 1_787_682_840_000;

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
	readonly durableState: () => {
		readonly semanticBound: boolean;
		readonly realtimeActive: boolean;
	};
	readonly advance: (milliseconds: number) => void;
	readonly setReadiness: (state: BrowserReadiness["state"]) => void;
	readonly setLink: (link: ThreadLinkSnapshot) => void;
	readonly setOrdinaryApproval: (approval: ApprovalOwnerView | null) => void;
	readonly setDynamicApprovals: (approvals: readonly BrowserDynamicApproval[]) => void;
	readonly emitProjectionChange: () => void;
	readonly setActionError: (error: unknown) => void;
	readonly setActionResult: (result: BrowserActionResult | undefined) => void;
	readonly setActionGate: (gate: Promise<BrowserActionResult> | null) => void;
	readonly setOrdinaryDisconnectGate: (gate: Promise<void> | null) => void;
	readonly setDynamicDisconnectGate: (gate: Promise<void> | null) => void;
	readonly setOrdinaryDisconnectError: (error: unknown) => void;
	readonly setDynamicDisconnectError: (error: unknown) => void;
	readonly binding: () => ThreadLinkBindingSnapshot;
	readonly makeOrdinaryApproval: () => ApprovalOwnerView;
	readonly makeDynamicApproval: (
		commandId: BrowserCommandId,
		targetThreadId?: ThreadId,
	) => BrowserDynamicApproval;
}

function executableLink(
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId,
		epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

function bindingFor(
	paneId: string,
	revision: number,
	link: ThreadLinkSnapshot,
): ThreadLinkBindingSnapshot {
	return {
		paneId,
		revision,
		link,
		cas: {
			revision,
			paneId,
			childId: link.childId,
			epoch: link.epoch,
			threadId: link.threadId,
		},
	};
}

function readinessFor(
	state: BrowserReadiness["state"],
	loginId: ReturnType<GatewayHarness["authorities"]["identity"]["decoder"]["adoptLoginId"]>,
): BrowserReadiness {
	if (
		state === "stopped" ||
		state === "storage_mismatch" ||
		state === "reconnecting" ||
		state === "incompatible_contract"
	)
		return { kind: "readiness", state, reason: "fixture" };
	if (state === "backoff")
		return { kind: "readiness", state, retryAtMs: CLOCK_START + 1, reason: "fixture" };
	if (state === "login_pending") return { kind: "readiness", state, loginId };
	return { kind: "readiness", state };
}

const readyAccount = (): BrowserOwnerProjection["account"] => ({
	kind: "codex_account_response",
	response: {
		account: { type: "chatgpt", email: "gateway@example.test", planType: "plus" },
		requiresOpenaiAuth: true,
	},
});

export function createGatewayHarness(
	authorities: IdentityAuthorities = createIdentityAuthorities(),
	lifecycle?: BrowserLifecyclePort,
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
	let dynamicApprovals: readonly BrowserDynamicApproval[] = [];
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
			attach: action("threadLink.attach"),
			relink: action("threadLink.relink"),
			onBrowserDisconnect: (_context, reason) => {
				durableDisconnects.push(`semantic:${reason}`);
				semanticBound = false;
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
			onBrowserDisconnect: (_context, reason) => {
				disconnects.push("ordinary");
				disconnectReasons.push(reason);
				ordinaryApproval = null;
				return settleDisconnect("ordinary", ordinaryDisconnectGate, ordinaryDisconnectError);
			},
		},
		dynamicApprovals: {
			pending: () => dynamicApprovals,
			resolve: action("dynamic.resolve"),
			onBrowserDisconnect: (_context, reason) => {
				disconnects.push("dynamic");
				disconnectReasons.push(reason);
				dynamicApprovals = [];
				return settleDisconnect("dynamic", dynamicDisconnectGate, dynamicDisconnectError);
			},
		},
	};
	const projection: BrowserProjectionPort = {
		read: ({ mediaReady }): BrowserOwnerProjection => ({
			readiness,
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
		}),
		onChange: (listener) => {
			projectionListeners.add(listener);
			return () => projectionListeners.delete(listener);
		},
	};
	const threadLink = { read: (pane: string) => bindingFor(pane, revision, link) };
	const gateway = createCodexWorkbenchGateway({
		identity: authorities,
		projection,
		threadLink,
		actions,
		lifecycle,
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
	const makeOrdinaryApproval = (): ApprovalOwnerView =>
		commandApprovalOwnerFixture({
			identity: authorities.identity,
			childId,
			epoch,
			requestId,
			threadId,
			turnId,
			itemId,
			approvalId,
			nowMs: CLOCK_START,
		});
	const makeDynamicApproval = (
		commandId: BrowserCommandId,
		targetThreadId = threadId,
	): BrowserDynamicApproval => {
		const operationId = authorities.operation.issuer.mintOperationId();
		const identity = model.DynamicApprovalIdentitySchema.parse({
			child: childId,
			epoch,
			threadId: targetThreadId,
			turnId,
			callId: authorities.identity.decoder.adoptDynamicToolCallId("gateway-call"),
			namespace: "archboard_app",
			tool: "send_message_to_thread",
			manifestHash: "gateway-manifest",
			operationId,
		});
		const effect = model.BrowserDynamicApprovalEffectSchema.parse({
			tool: "send_message_to_thread",
			arguments: { threadId: targetThreadId, prompt: "Send one bounded message" },
			target: targetThreadId,
			effectiveBoundary: null,
			mutationOperationId: operationId,
			initialTurnOperationId: null,
			visualSummary: "Send one bounded message",
		});
		const fullEffect = model.DynamicApprovalEffectSchema.parse({
			tool: "send_message_to_thread",
			arguments: effect.arguments,
			callerAuthority: "caller-authority",
			targetAuthority: "target-authority",
			contextAuthority: "context-authority",
			effectiveBoundary: null,
			mutationOperationId: operationId,
			initialTurnOperationId: null,
			visualSummary: effect.visualSummary,
		});
		const effectHash = model.effectHashForRequest({ identity, effect: fullEffect });
		return model.BrowserDynamicApprovalSchema.parse({
			kind: "dynamic_approval",
			state: "pending",
			identity,
			effect,
			effectHash,
			createdAtMs: CLOCK_START,
			expiresAtMs: CLOCK_START + 90_000,
			decision: null,
			delivery: null,
			toolResult: null,
			binding: { commandId, paneId, capturedLink: { threadId: targetThreadId, childId, epoch } },
			resumable: false,
		});
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
		durableState: () => ({ semanticBound, realtimeActive }),
		advance: (milliseconds) => {
			clock += milliseconds;
		},
		setReadiness,
		setLink,
		setOrdinaryApproval: (approval) => {
			ordinaryApproval = approval;
			emitProjectionChange();
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

export function commandTarget(lease: {
	readonly commandId: BrowserCommandId;
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}) {
	return {
		kind: "browser_command" as const,
		commandId: lease.commandId,
		paneId: lease.paneId,
		childId: lease.childId,
		epoch: lease.epoch,
	};
}

export function latestDelta(messages: readonly BrowserGatewayMessage[]) {
	return messages.findLast((message) => message.kind === "delta");
}

export function snapshotOf(message: BrowserGatewayMessage): BrowserSnapshot {
	if (message.kind === "snapshot") return message.snapshot;
	throw new Error("expected a full browser snapshot");
}
