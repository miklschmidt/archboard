import { createIdentityAuthority } from "../../codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../index.js";
import type { BrowserCommand, BrowserSnapshot } from "../index.js";

const authority = createIdentityAuthority();
const model = createCodexBrowserModel(authority);
const childId = model.ChildIdSchema.parse(authority.validator.childId);
const epoch = model.ChildEpochSchema.parse(authority.validator.epoch);
const requestId = model.JsonRpcRequestIdSchema.parse(authority.issuer.mintJsonRpcRequestId());
const commandId = model.BrowserCommandIdSchema.parse(authority.issuer.mintBrowserCommandId());
const threadId = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("thread-fixture"));
const turnId = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("turn-fixture"));
const coordinatorThreadId = model.ThreadIdSchema.parse(
	authority.decoder.adoptThreadId("coordinator-fixture"),
);
const coordinatorTurnId = model.TurnIdSchema.parse(
	authority.decoder.adoptTurnId("coordinator-turn-fixture"),
);
const itemId = model.ItemIdSchema.parse(authority.decoder.adoptItemId("item-fixture"));
const approvalId = model.ApprovalIdSchema.parse(
	authority.decoder.adoptApprovalId("approval-fixture"),
);
const toolCallId = model.DynamicToolCallIdSchema.parse(
	authority.decoder.adoptDynamicToolCallId("call-fixture"),
);
const queueId = model.QueuedSubmissionIdSchema.parse(
	authority.decoder.adoptQueuedSubmissionId("queue-fixture"),
);
const loginId = model.LoginIdSchema.parse(authority.decoder.adoptLoginId("login-fixture"));
const realtimeSessionId = model.RealtimeSessionIdSchema.parse(
	authority.issuer.mintRealtimeSessionId(),
);

const target = { commandId, paneId: "pane-fixture", childId, epoch };
const readiness = { kind: "readiness" as const, state: "account_ready" as const };
const account = {
	kind: "account" as const,
	state: "ready" as const,
	accountType: "chatgpt" as const,
};
const login = { kind: "login" as const, state: "completed" as const, loginId };
const threadLink = {
	kind: "thread_link" as const,
	state: "executable" as const,
	childId,
	epoch,
	threadId,
	source: "appServer" as const,
	status: "idle" as const,
	loaded: true as const,
	canAcceptDirectInput: true as const,
	reason: null,
};
const timeline = {
	kind: "timeline" as const,
	threadId,
	turns: [
		{
			turnId,
			status: "completed" as const,
			items: [{ media: "text" as const, itemId, text: "Hello" }],
			summary: "completed · user: Hello · assistant: Hi",
			outputsIncluded: true,
			outputsTruncated: false,
		},
	],
	nextCursor: null,
};
const queue = {
	kind: "queue" as const,
	status: "outcome_unknown" as const,
	entries: [
		{
			submissionId: queueId,
			prompt: "Queue me",
			status: "queued" as const,
			operationId: toolCallId,
		},
	],
};
const settings = {
	kind: "settings" as const,
	owner: "coordinator" as const,
	model: "gpt-5.6-luna",
	effort: "medium",
	serviceTier: "priority",
	approvalPolicy: "on-request" as const,
	approvalsReviewer: "user" as const,
	sandbox: { mode: "full_access" as const, network: "unspecified" as const },
	activePermissionProfile: null,
};
const approval = {
	kind: "approval" as const,
	approvalKind: "command_execution" as const,
	requestId,
	threadId,
	turnId,
	itemId,
	approvalId,
	expiresAtMs: 1_787_682_840_000,
	lifecycle: { state: "pending" as const, decision: null, outcome: null, reason: null },
	binding: {
		child: childId,
		epoch,
		link: "pane-fixture",
		target: "thread-fixture",
		effect: "Run bun test in /repo",
	},
	spoken: { eligible: true, reason: "eligible" as const },
	reason: null,
	command: "bun test",
	cwd: "/repo",
	availableDecisions: ["accept", "decline"] as const,
};
const semantic = {
	kind: "semantic_delivery" as const,
	threadId,
	delivery: "outcome_unknown" as const,
	capturedAtMs: 1_787_682_840_000,
	freshUntilMs: 1_787_682_870_000,
	reason: null,
};
const coordinator = {
	kind: "coordinator" as const,
	state: "active" as const,
	threadId: coordinatorThreadId,
	activeTurnId: coordinatorTurnId,
	configuredModel: "gpt-5.6-luna",
	configuredEffort: "medium",
	model: "gpt-5.6-luna",
	effort: "medium",
	serviceTier: "priority",
	reason: null,
};
const voice = {
	kind: "voice" as const,
	state: "active" as const,
	realtimeSessionId,
	transcript: [{ itemId, sequence: 1, speaker: "user" as const, text: "Hello", final: true }],
	delivery: "delivered" as const,
	reason: null,
};
const lease = {
	kind: "command_lease" as const,
	commandId,
	paneId: "pane-fixture",
	childId,
	epoch,
	state: "active" as const,
	expiresAtMs: 1_787_682_990_000,
};
const operation = {
	kind: "operation_outcome" as const,
	operationId: commandId,
	outcome: "outcome_unknown" as const,
	message: "Inspect state.",
};

export function createFixtureIds(): {
	snapshot: BrowserSnapshot;
	textCommand: ReturnType<typeof model.BrowserTextCommandSchema.parse>;
	browserCommand: BrowserCommand;
	requestId: typeof requestId;
	model: typeof model;
	identity: typeof authority;
} {
	const snapshot: BrowserSnapshot = model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness,
		account,
		login,
		threadLink,
		timeline,
		queue,
		settings: [settings],
		approvals: [approval],
		dynamicApprovals: [],
		semantic,
		coordinator,
		voice,
		lease,
		operation,
	});
	const browserCommand = model.BrowserCommandSchema.parse({
		...target,
		kind: "browser_command",
		command: "accountLogout",
	});
	const textCommand = model.BrowserTextCommandSchema.parse({
		...target,
		kind: "text_command",
		command: "start",
		threadId,
		prompt: "Start",
	});
	return { snapshot, textCommand, browserCommand, requestId, model, identity: authority };
}
