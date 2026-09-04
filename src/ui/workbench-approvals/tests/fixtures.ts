import type {
	BrowserApproval,
	BrowserDynamicApproval,
} from "../../../shared/codex-browser-model/index.js";
import {
	APPROVAL_ID,
	CHILD,
	callId,
	COMMAND_ID,
	EPOCH,
	EXPIRES_AT,
	EXPIRY_MS,
	HASH,
	ITEM,
	NOW,
	operationId,
	OTHER_THREAD,
	PANE,
	parseApproval,
	parseDynamicApproval,
	requestId,
	THREAD,
	TURN,
} from "./model.js";

type Overrides = Readonly<Record<string, unknown>>;
type DynamicEffect = BrowserDynamicApproval["effect"];

const BINDING = {
	child: CHILD,
	epoch: EPOCH,
	link: "pane primary to workhorse-a",
	target: "workhorse-a in the archboard checkout",
	effect: "run one command in the workspace",
};

export const IMMUTABLE_TARGET = BINDING.target;

/** Every ordinary terminal decision the closed lifecycle can publish. */
export const TERMINAL_LIFECYCLES: readonly (readonly [string, Overrides])[] = [
	["stale", { state: "stale", decision: "cancelled", outcome: null, reason: "A new epoch." }],
	[
		"expired",
		{ state: "expired", decision: "cancelled", outcome: null, reason: "The deadline passed." },
	],
	[
		"cancelled",
		{ state: "cancelled", decision: "cancelled", outcome: null, reason: "The turn stopped." },
	],
	[
		"delivered",
		{ state: "settled", decision: "approved", outcome: "delivered", reason: "Delivered." },
	],
	[
		"not_delivered",
		{
			state: "settled",
			decision: "approved",
			outcome: "not_delivered",
			reason: "The child exited.",
		},
	],
	[
		"outcome_unknown",
		{
			state: "outcome_unknown",
			decision: "approved",
			outcome: "outcome_unknown",
			reason: "The write was lost.",
		},
	],
];
export { HASH } from "./model.js";
export const PENDING = { state: "pending", decision: null, outcome: null, reason: null } as const;

export function envelope(overrides: Overrides = {}): Readonly<Record<string, unknown>> {
	return {
		kind: "approval",
		requestId: requestId(),
		threadId: THREAD,
		turnId: TURN,
		itemId: ITEM,
		approvalId: APPROVAL_ID,
		expiresAtMs: EXPIRES_AT,
		lifecycle: PENDING,
		binding: BINDING,
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	};
}

export function commandApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
		approvalKind: "command_execution",
		reason: "The sandbox refused the write.",
		command: "rm -rf build",
		availableDecisions: ["accept", "decline"],
		spoken: { eligible: true, reason: "eligible" },
		...overrides,
	});
}

export function fileChangeApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
		approvalKind: "file_change",
		reason: "Two files leave the workspace root.",
		availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
		spoken: { eligible: false, reason: "broader_grant" },
		...overrides,
	});
}

export function permissionsApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
		approvalKind: "permissions",
		reason: "The agent wants the network for a package install.",
		requestedScope: { network: true, fileAccess: ["read", "write"] },
		spoken: { eligible: false, reason: "permission_scope" },
		...overrides,
	});
}

export function applyPatchApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope({ turnId: null, itemId: null, approvalId: null }),
		approvalKind: "apply_patch",
		reason: "A legacy conversation asked to apply a patch.",
		fileCount: 3,
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	});
}

export function execCommandApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope({ turnId: null }),
		approvalKind: "exec_command",
		reason: "A legacy conversation asked to run a command.",
		command: ["git", "status"],
		spoken: { eligible: false, reason: "not_binary" },
		...overrides,
	});
}

export function userInputApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
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
	});
}

export function elicitationField(overrides: Overrides = {}): Readonly<Record<string, unknown>> {
	return {
		name: "value",
		type: "string",
		required: false,
		secret: false,
		title: null,
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
		...overrides,
	};
}

export const ELICITATION_FIELDS = [
	elicitationField({
		name: "host",
		required: true,
		title: "Host",
		description: "The service host.",
		format: "uri",
		defaultValue: "https://example.test",
	}),
	elicitationField({
		name: "port",
		type: "integer",
		required: true,
		title: "Port",
		minimum: 1,
		maximum: 65_535,
		defaultValue: 443,
	}),
	elicitationField({ name: "apiKey", required: true, secret: true, title: "API key" }),
	elicitationField({ name: "tls", type: "boolean", title: "Use TLS" }),
	elicitationField({ name: "tier", type: "enum", title: "Tier", options: ["basic", "premium"] }),
];

export function elicitationApproval(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
		approvalKind: "elicitation",
		serverName: "archboard-mcp",
		mode: "form",
		message: "The server needs connection details.",
		url: null,
		fields: ELICITATION_FIELDS,
		spoken: { eligible: false, reason: "form" },
		...overrides,
	});
}

/**
 * The closed model already refuses a non-http URL, so this one is deliberately
 * built outside it. `elicitationSchema` proves the contract rejects it while the
 * surface proves the browser refuses to render it as a link.
 */
export function unsafeUrlElicitation(): Readonly<Record<string, unknown>> {
	return {
		...envelope(),
		approvalKind: "elicitation",
		serverName: "archboard-mcp",
		mode: "url",
		message: "Open the consent page.",
		url: "javascript:alert(1)",
		fields: null,
		spoken: { eligible: false, reason: "url" },
	};
}

export function safeUrlElicitation(overrides: Overrides = {}): BrowserApproval {
	return parseApproval({
		...envelope(),
		approvalKind: "elicitation",
		serverName: "archboard-mcp",
		mode: "url",
		message: "Open the consent page.",
		url: "https://example.test/consent",
		fields: null,
		spoken: { eligible: false, reason: "url" },
		...overrides,
	});
}

const CREATE_MUTATION = operationId();
const SELF_FORK_MUTATION = operationId();
const OTHER_FORK_MUTATION = operationId();
const SEND_MUTATION = operationId();

export const CREATE_EFFECT: DynamicEffect = {
	tool: "create_thread",
	arguments: { prompt: "Investigate the queue backlog." },
	target: null,
	effectiveBoundary: null,
	mutationOperationId: CREATE_MUTATION,
	initialTurnOperationId: operationId(),
	visualSummary: "Create a thread and start it on the queue backlog.",
};

export const SELF_FORK_EFFECT: DynamicEffect = {
	tool: "fork_thread",
	arguments: { threadId: THREAD, beforeTurnId: TURN, prompt: "Try the other migration." },
	target: THREAD,
	effectiveBoundary: { relation: "self", beforeTurnId: TURN },
	mutationOperationId: SELF_FORK_MUTATION,
	initialTurnOperationId: operationId(),
	visualSummary: "Fork this thread before its current turn and try the other migration.",
};

export const OTHER_FORK_EFFECT: DynamicEffect = {
	tool: "fork_thread",
	arguments: { threadId: OTHER_THREAD, beforeTurnId: null, prompt: null },
	target: OTHER_THREAD,
	effectiveBoundary: { relation: "other", beforeTurnId: null },
	mutationOperationId: OTHER_FORK_MUTATION,
	initialTurnOperationId: null,
	visualSummary: "Fork the other thread from its current head without starting a turn.",
};

export const SEND_EFFECT: DynamicEffect = {
	tool: "send_message_to_thread",
	arguments: { threadId: OTHER_THREAD, prompt: "Rebase onto the transport branch." },
	target: OTHER_THREAD,
	effectiveBoundary: null,
	mutationOperationId: SEND_MUTATION,
	initialTurnOperationId: null,
	visualSummary: "Send one message to the other thread.",
};

const CALL_NAMES = new Map<DynamicEffect, string>([
	[CREATE_EFFECT, "call-create"],
	[SELF_FORK_EFFECT, "call-self-fork"],
	[OTHER_FORK_EFFECT, "call-other-fork"],
	[SEND_EFFECT, "call-send"],
]);

export function dynamicIdentity(effect: DynamicEffect): BrowserDynamicApproval["identity"] {
	return {
		child: CHILD,
		epoch: EPOCH,
		threadId: THREAD,
		turnId: TURN,
		callId: callId(CALL_NAMES.get(effect) ?? `call-${effect.tool}`),
		namespace: "archboard_app",
		tool: effect.tool,
		manifestHash: "manifest-1",
		operationId: effect.mutationOperationId,
	};
}

export function dynamicApproval(
	effect: DynamicEffect,
	overrides: Overrides = {},
): BrowserDynamicApproval {
	return parseDynamicApproval({
		kind: "dynamic_approval",
		state: "pending",
		identity: dynamicIdentity(effect),
		effect,
		effectHash: HASH,
		createdAtMs: NOW,
		expiresAtMs: NOW + EXPIRY_MS,
		decision: null,
		delivery: null,
		toolResult: null,
		binding: {
			commandId: COMMAND_ID,
			paneId: PANE,
			capturedLink: { threadId: THREAD, childId: CHILD, epoch: EPOCH },
		},
		resumable: false,
		...overrides,
	});
}

export function dynamicDecision(
	effect: DynamicEffect,
	outcome: string,
	cause: string,
): Readonly<Record<string, unknown>> {
	return {
		outcome,
		identity: dynamicIdentity(effect),
		effectHash: HASH,
		decidedAtMs: NOW,
		cause,
	};
}
