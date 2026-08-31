import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserAccount,
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserProjection,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserWorkbenchActions,
	BrowserActionResult,
	BrowserProjectionPort,
	BrowserGatewayMessage,
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
	readonly advance: (milliseconds: number) => void;
	readonly setReadiness: (state: BrowserReadiness["state"]) => void;
	readonly setLink: (link: ThreadLinkSnapshot) => void;
	readonly setOrdinaryApproval: (approval: BrowserApproval | null) => void;
	readonly setDynamicApprovals: (approvals: readonly BrowserDynamicApproval[]) => void;
	readonly emitProjectionChange: () => void;
	readonly setActionError: (error: unknown) => void;
	readonly setActionResult: (result: BrowserActionResult | undefined) => void;
	readonly setActionGate: (gate: Promise<BrowserActionResult> | null) => void;
	readonly binding: () => ThreadLinkBindingSnapshot;
	readonly makeOrdinaryApproval: () => BrowserApproval;
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

export function createGatewayHarness(): GatewayHarness {
	const authorities = createIdentityAuthorities();
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
	let account: BrowserAccount = { kind: "account", state: "ready", accountType: "chatgpt" };
	let link: ThreadLinkSnapshot = executableLink(childId, epoch, threadId);
	let revision = 0;
	let ordinaryApproval: BrowserApproval | null = null;
	let dynamicApprovals: readonly BrowserDynamicApproval[] = [];
	let actionError: unknown = null;
	let actionResult: BrowserActionResult | undefined;
	let actionGate: Promise<BrowserActionResult> | null = null;
	const calls: string[] = [];
	const disconnects: string[] = [];
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
			start: action("realtime.start"),
			appendText: action("realtime.appendText"),
			stop: action("realtime.stop"),
		},
		ordinaryApprovals: {
			pending: (candidate) => (candidate === requestId ? ordinaryApproval : null),
			resolve: action("approval.resolve"),
			onBrowserDisconnect: () => {
				disconnects.push("ordinary");
				ordinaryApproval = null;
			},
		},
		dynamicApprovals: {
			pending: () => dynamicApprovals,
			resolve: action("dynamic.resolve"),
			onBrowserDisconnect: () => {
				disconnects.push("dynamic");
				dynamicApprovals = [];
			},
		},
	};
	const projection: BrowserProjectionPort = {
		read: (): BrowserProjection => ({
			readiness,
			account,
			login: { kind: "login", state: "idle" },
			timeline: null,
			queue: { kind: "queue", status: "empty", entries: [] },
			settings: [],
			approvals: ordinaryApproval === null ? [] : [ordinaryApproval],
			dynamicApprovals,
			semantic: null,
			coordinator: {
				kind: "coordinator",
				state: "unbound",
				threadId: null,
				activeTurnId: null,
				model: null,
				effort: null,
				serviceTier: null,
				reason: null,
			},
			voice: {
				kind: "voice",
				state: "unavailable",
				realtimeSessionId: null,
				transcript: [],
				delivery: null,
				reason: null,
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
		now: () => clock,
	});

	const emitProjectionChange = (): void => {
		for (const listener of projectionListeners) listener();
	};
	const setReadiness = (state: BrowserReadiness["state"]): void => {
		readiness = readinessFor(state, loginId);
		account =
			state === "account_ready" || state === "thread_capable"
				? { kind: "account", state: "ready", accountType: "chatgpt" }
				: { kind: "account", state: "signed_out" };
		emitProjectionChange();
	};
	const setLink = (next: ThreadLinkSnapshot): void => {
		link = next;
		revision += 1;
		emitProjectionChange();
	};
	const makeOrdinaryApproval = (): BrowserApproval => ({
		kind: "approval",
		approvalKind: "command_execution",
		requestId,
		threadId,
		turnId,
		itemId,
		approvalId,
		expiresAtMs: CLOCK_START + 90_000,
		reason: null,
		command: "bun test",
		cwd: "/repo",
		availableDecisions: ["accept", "decline"],
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
