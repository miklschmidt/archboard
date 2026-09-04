import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
} from "../../workbench-transport/index.js";
import type { WorkbenchApprovalsTransport } from "../index.js";

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;
type Envelope = Pick<
	BrowserApproval,
	| "kind"
	| "requestId"
	| "threadId"
	| "turnId"
	| "itemId"
	| "approvalId"
	| "expiresAtMs"
	| "lifecycle"
	| "binding"
	| "spoken"
>;
type Identity = BrowserDynamicApproval["identity"];
type DynamicEffect = BrowserDynamicApproval["effect"];

export const NOW = 1_700_000_000_000;
export const EXPIRY_MS = 90_000;
export const EXPIRES_AT = NOW + EXPIRY_MS;
export const CHILD = "child-a" as ExecutableLink["childId"];
export const EPOCH = "epoch-a" as ExecutableLink["epoch"];
export const THREAD = "workhorse-a" as ExecutableLink["threadId"];
export const OTHER_THREAD = "workhorse-b" as ExecutableLink["threadId"];
export const TURN = "turn-a" as NonNullable<BrowserApproval["turnId"]>;
export const HASH = `sha256:${"a".repeat(64)}`;

function identity<Value>(value: string): Value {
	return value as unknown as Value;
}

export function executableLink(): ExecutableLink {
	return {
		kind: "thread_link",
		state: "executable",
		childId: CHILD,
		epoch: EPOCH,
		threadId: THREAD,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

export function envelope(overrides: Partial<Envelope> = {}): Envelope {
	return {
		kind: "approval",
		requestId: identity<Envelope["requestId"]>("request-1"),
		threadId: THREAD,
		turnId: TURN,
		itemId: identity<NonNullable<Envelope["itemId"]>>("item-1"),
		approvalId: identity<NonNullable<Envelope["approvalId"]>>("approval-1"),
		expiresAtMs: EXPIRES_AT,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: CHILD,
			epoch: EPOCH,
			link: "pane primary to workhorse-a",
			target: "workhorse-a in the archboard checkout",
			effect: "run one command in the workspace",
		},
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	};
}

export function commandApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope(),
		approvalKind: "command_execution",
		reason: "The sandbox refused the write.",
		command: "rm -rf build",
		availableDecisions: ["accept", "decline"],
		spoken: { eligible: true, reason: "eligible" },
		...overrides,
	} as BrowserApproval;
}

export function fileChangeApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({ requestId: identity<Envelope["requestId"]>("request-2") }),
		approvalKind: "file_change",
		reason: "Two files leave the workspace root.",
		availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
		spoken: { eligible: false, reason: "broader_grant" },
		...overrides,
	} as BrowserApproval;
}

export function permissionsApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({ requestId: identity<Envelope["requestId"]>("request-3") }),
		approvalKind: "permissions",
		reason: "The agent wants the network for a package install.",
		requestedScope: { network: true, fileAccess: ["read", "write"] },
		spoken: { eligible: false, reason: "permission_scope" },
		...overrides,
	} as BrowserApproval;
}

export function applyPatchApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({
			requestId: identity<Envelope["requestId"]>("request-4"),
			turnId: null,
			itemId: null,
			approvalId: null,
		}),
		approvalKind: "apply_patch",
		reason: "A legacy conversation asked to apply a patch.",
		fileCount: 3,
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	} as BrowserApproval;
}

export function execCommandApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({ requestId: identity<Envelope["requestId"]>("request-5"), turnId: null }),
		approvalKind: "exec_command",
		reason: "A legacy conversation asked to run a command.",
		command: ["git", "status"],
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	} as BrowserApproval;
}

export function userInputApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({ requestId: identity<Envelope["requestId"]>("request-6") }),
		approvalKind: "user_input",
		questions: [
			{
				id: "environment",
				header: "Which environment",
				question: "Which environment should the deploy target?",
				isOther: true,
				isSecret: false,
				options: [
					{ label: "staging", description: "The shared staging cluster" },
					{ label: "production", description: "The live cluster" },
				],
			},
			{
				id: "token",
				header: "Deploy token",
				question: "Paste the deploy token.",
				isOther: false,
				isSecret: true,
				options: null,
			},
		],
		spoken: { eligible: false, reason: "secret" },
		...overrides,
	} as BrowserApproval;
}

export function elicitationApproval(overrides: Partial<BrowserApproval> = {}): BrowserApproval {
	return {
		...envelope({ requestId: identity<Envelope["requestId"]>("request-7") }),
		approvalKind: "elicitation",
		serverName: "archboard-mcp",
		mode: "form",
		message: "The server needs connection details.",
		url: null,
		fields: [
			{
				name: "host",
				type: "string",
				required: true,
				secret: false,
				title: "Host",
				description: "The service host.",
				format: "uri",
				minimum: null,
				maximum: null,
				minLength: null,
				maxLength: null,
				minimumItems: null,
				maximumItems: null,
				options: null,
				defaultValue: "https://example.test",
			},
			{
				name: "port",
				type: "integer",
				required: true,
				secret: false,
				title: "Port",
				description: null,
				format: null,
				minimum: 1,
				maximum: 65_535,
				minLength: null,
				maxLength: null,
				minimumItems: null,
				maximumItems: null,
				options: null,
				defaultValue: 443,
			},
			{
				name: "apiKey",
				type: "string",
				required: true,
				secret: true,
				title: "API key",
				description: null,
				format: null,
				minimum: null,
				maximum: null,
				minLength: null,
				maxLength: null,
				minimumItems: null,
				maximumItems: null,
				options: null,
				defaultValue: null,
			},
			{
				name: "tls",
				type: "boolean",
				required: false,
				secret: false,
				title: "Use TLS",
				description: null,
				format: null,
				minimum: null,
				maximum: null,
				minLength: null,
				maxLength: null,
				minimumItems: null,
				maximumItems: null,
				options: null,
				defaultValue: null,
			},
			{
				name: "tier",
				type: "enum",
				required: false,
				secret: false,
				title: "Tier",
				description: null,
				format: null,
				minimum: null,
				maximum: null,
				minLength: null,
				maxLength: null,
				minimumItems: null,
				maximumItems: null,
				options: ["basic", "premium"],
				defaultValue: null,
			},
		],
		spoken: { eligible: false, reason: "form" },
		...overrides,
	} as BrowserApproval;
}

export function dynamicIdentity(
	tool: Identity["tool"],
	overrides: Partial<Identity> = {},
): Identity {
	return {
		child: CHILD,
		epoch: EPOCH,
		threadId: THREAD,
		turnId: TURN,
		callId: identity<Identity["callId"]>(`call-${tool}`),
		namespace: "archboard_app",
		tool,
		manifestHash: "manifest-1",
		operationId: identity<Identity["operationId"]>(`operation-${tool}`),
		...overrides,
	};
}

export const CREATE_EFFECT: DynamicEffect = {
	tool: "create_thread",
	arguments: { prompt: "Investigate the queue backlog." },
	target: null,
	effectiveBoundary: null,
	mutationOperationId: identity<Identity["operationId"]>("operation-create_thread"),
	initialTurnOperationId: identity<Identity["operationId"]>("operation-create_thread-turn"),
	visualSummary: "Create a thread and start it on the queue backlog.",
};

export const SELF_FORK_EFFECT: DynamicEffect = {
	tool: "fork_thread",
	arguments: { threadId: THREAD, beforeTurnId: TURN, prompt: "Try the other migration." },
	target: THREAD,
	effectiveBoundary: { relation: "self", beforeTurnId: TURN },
	mutationOperationId: identity<Identity["operationId"]>("operation-fork_thread"),
	initialTurnOperationId: identity<Identity["operationId"]>("operation-fork_thread-turn"),
	visualSummary: "Fork this thread before its current turn and try the other migration.",
};

export const OTHER_FORK_EFFECT: DynamicEffect = {
	tool: "fork_thread",
	arguments: { threadId: OTHER_THREAD, beforeTurnId: null, prompt: null },
	target: OTHER_THREAD,
	effectiveBoundary: { relation: "other", beforeTurnId: null },
	mutationOperationId: identity<Identity["operationId"]>("operation-fork_thread"),
	initialTurnOperationId: null,
	visualSummary: "Fork the other thread from its current head without starting a turn.",
};

export const SEND_EFFECT: DynamicEffect = {
	tool: "send_message_to_thread",
	arguments: { threadId: OTHER_THREAD, prompt: "Rebase onto the transport branch." },
	target: OTHER_THREAD,
	effectiveBoundary: null,
	mutationOperationId: identity<Identity["operationId"]>("operation-send_message_to_thread"),
	initialTurnOperationId: null,
	visualSummary: "Send one message to the other thread.",
};

export function dynamicApproval(
	effect: DynamicEffect,
	overrides: Partial<BrowserDynamicApproval> = {},
): BrowserDynamicApproval {
	return {
		kind: "dynamic_approval",
		state: "pending",
		identity: dynamicIdentity(effect.tool),
		effect,
		effectHash: HASH,
		createdAtMs: NOW,
		expiresAtMs: NOW + EXPIRY_MS,
		decision: null,
		delivery: null,
		toolResult: null,
		binding: {
			commandId: identity<BrowserWorkbenchCommandTarget["commandId"]>("lease-1"),
			paneId: "primary",
			capturedLink: { threadId: THREAD, childId: CHILD, epoch: EPOCH },
		},
		resumable: false,
		...overrides,
	} as BrowserDynamicApproval;
}

export function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: executableLink(),
		timeline: { kind: "timeline", threadId: THREAD, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: identity<NonNullable<BrowserSnapshot["coordinator"]["threadId"]>>("coordinator-a"),
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
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
			reason: "Voice is unavailable.",
		},
		lease: null,
		operation: null,
		...overrides,
	};
}

export function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 4,
	};
}

export function commandTarget(): BrowserWorkbenchCommandTarget {
	return {
		commandId: identity<BrowserWorkbenchCommandTarget["commandId"]>("lease-1"),
		paneId: "primary",
		childId: CHILD,
		epoch: EPOCH,
		capturedThreadLink: executableLink(),
	};
}

export interface RecordedCommand {
	readonly draft: unknown;
	readonly target: BrowserWorkbenchCommandTarget | undefined;
}

export interface FakeTransport extends WorkbenchApprovalsTransport {
	readonly sent: RecordedCommand[];
}

export function fakeTransport(
	options: {
		readonly canCommand?: boolean;
		readonly target?: BrowserWorkbenchCommandTarget | null;
		readonly result?: Partial<BrowserWorkbenchCommandResult>;
		readonly failure?: unknown;
	} = {},
): FakeTransport {
	const sent: RecordedCommand[] = [];
	const target = options.target === undefined ? commandTarget() : options.target;
	return {
		sent,
		capabilities: () =>
			({ canCommand: options.canCommand ?? true }) as ReturnType<
				WorkbenchApprovalsTransport["capabilities"]
			>,
		captureCommandTarget: () => {
			if (target === null) throw new Error("A browser command lease is required.");
			return target;
		},
		command: async (draft, commandTargetValue) => {
			sent.push({ draft, target: commandTargetValue });
			if (options.failure !== undefined) throw options.failure;
			return {
				kind: "command_result",
				commandId: identity<BrowserWorkbenchCommandResult["commandId"]>("lease-1"),
				outcome: "delivered",
				code: null,
				message: null,
				snapshot: snapshot(),
				...options.result,
			} as BrowserWorkbenchCommandResult;
		},
	};
}
