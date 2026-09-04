import { afterEach, expect, test } from "bun:test";

import {
	CODEX_APPROVAL_EXPIRY_MS,
	createCodexBrowserModel,
	type BrowserDynamicApproval,
} from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createBrowserWorkbenchTransport, type BrowserCommandDraft } from "../index.js";
import { FakeSocket, rejection, type Transport } from "./fake-socket.js";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const childId = authorities.identity.validator.childId;
const epoch = authorities.identity.validator.epoch;
const threadId = authorities.identity.decoder.adoptThreadId("thread-a");
const turnId = authorities.identity.decoder.adoptTurnId("turn-a");
const callId = authorities.identity.decoder.adoptDynamicToolCallId("call-a");
const operationId = authorities.operation.issuer.mintOperationId();
const identity = model.DynamicApprovalIdentitySchema.parse({
	child: childId,
	epoch,
	threadId,
	turnId,
	callId,
	namespace: "archboard_app",
	tool: "send_message_to_thread",
	manifestHash: "manifest-a",
	operationId,
});
const effect = model.DynamicApprovalEffectSchema.parse({
	tool: "send_message_to_thread",
	arguments: { threadId, prompt: "send the reviewed message" },
	callerAuthority: "caller-authority",
	targetAuthority: "target-authority",
	contextAuthority: "context-authority",
	effectiveBoundary: null,
	mutationOperationId: operationId,
	initialTurnOperationId: null,
	visualSummary: "Send the reviewed message to the target thread",
});
const effectHash = model.effectHashForRequest({ identity, effect });
const browserEffect = model.BrowserDynamicApprovalEffectSchema.parse({
	tool: effect.tool,
	arguments: effect.arguments,
	target: threadId,
	effectiveBoundary: null,
	mutationOperationId: effect.mutationOperationId,
	initialTurnOperationId: null,
	visualSummary: effect.visualSummary,
});
const createdAtMs = 200_000;
const pending = model.BrowserDynamicApprovalSchema.parse({
	kind: "dynamic_approval",
	state: "pending",
	identity,
	effect: browserEffect,
	effectHash,
	createdAtMs,
	expiresAtMs: createdAtMs + CODEX_APPROVAL_EXPIRY_MS,
	decision: null,
	delivery: null,
	toolResult: null,
	binding: {
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		paneId: "pane-a",
		capturedLink: { threadId, childId, epoch },
	},
	resumable: false,
}) as BrowserDynamicApproval;

function snapshot(
	options: {
		readonly lease?: Record<string, unknown> | null;
		readonly dynamicApprovals?: readonly BrowserDynamicApproval[];
	} = {},
): Record<string, unknown> {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: { kind: "timeline", threadId, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: options.dynamicApprovals ?? [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "unbound",
			threadId: null,
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
			reason: null,
		},
		lease: options.lease ?? null,
		operation: null,
	};
}

function lease(expiresAtMs: number): Record<string, unknown> {
	return {
		kind: "command_lease",
		commandId: pending.binding!.commandId,
		paneId: pending.binding!.paneId,
		childId,
		epoch,
		state: "active",
		expiresAtMs,
	};
}

function dynamicDraft(): BrowserCommandDraft {
	return {
		command: "dynamicApprovalRespond",
		capturedLink: { threadId, childId, epoch },
		identity,
		effectHash,
		decision: "approve",
	} as unknown as BrowserCommandDraft;
}

function commandResult(value: Record<string, unknown>) {
	return {
		kind: "command_result",
		commandId: pending.binding!.commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: value,
	};
}

async function attach(
	transport: Transport,
	socket: FakeSocket,
	value: Record<string, unknown>,
): Promise<void> {
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, { kind: "snapshot", sequence: 1, snapshot: value });
	};
	await transport.attach(socket);
}

const transports: Transport[] = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.dispose();
});

test("valid dynamic approval responses require one live pending approval and use the shared parser", async () => {
	const transport = createBrowserWorkbenchTransport({ now: () => 200_000 });
	transports.push(transport);
	const socket = new FakeSocket();
	const current = snapshot({ lease: lease(260_000), dynamicApprovals: [pending] });
	socket.onRequest = (request, activeSocket) => {
		if (request.action === "subscribe")
			activeSocket.reply(request, { kind: "snapshot", sequence: 1, snapshot: current });
		else if (request.action === "command") activeSocket.reply(request, commandResult(current));
		else if (request.action === "snapshot")
			activeSocket.reply(request, { kind: "snapshot", sequence: 2, snapshot: current });
	};
	await transport.attach(socket);
	const result = await transport.command(dynamicDraft());
	const request = socket.sent.find((candidate) => candidate.action === "command");
	expect(result.outcome).toBe("delivered");
	expect(request?.command).toMatchObject({
		command: "dynamicApprovalRespond",
		commandId: pending.binding!.commandId,
		paneId: "pane-a",
		childId,
		epoch,
		capturedLink: { threadId, childId, epoch },
		identity,
		effectHash,
	});
});

test("changing every dynamic identity, binding, state, or expiry component sends no command", async () => {
	const clock = 200_000;
	const identityFields = [
		"child",
		"epoch",
		"threadId",
		"turnId",
		"callId",
		"namespace",
		"tool",
		"manifestHash",
		"operationId",
	] as const;
	const draftCases: Array<readonly [string, Record<string, unknown>]> = identityFields.map(
		(field) => {
			const draft = dynamicDraft() as unknown as Record<string, unknown>;
			draft.identity = { ...identity, [field]: `different-${field}` };
			return [field, draft] as const;
		},
	);
	draftCases.push(["effectHash", { ...dynamicDraft(), effectHash: `sha256:${"1".repeat(64)}` }]);
	for (const field of ["threadId", "childId", "epoch"] as const) {
		draftCases.push([
			`capturedLink.${field}`,
			{
				...dynamicDraft(),
				capturedLink: { threadId, childId, epoch, [field]: `different-${field}` },
			},
		]);
	}
	for (const [field, draft] of draftCases) {
		const transport = createBrowserWorkbenchTransport({ now: () => clock });
		transports.push(transport);
		const socket = new FakeSocket();
		await attach(
			transport,
			socket,
			snapshot({ lease: lease(260_000), dynamicApprovals: [pending] }),
		);
		const error = await rejection(transport.command(draft as BrowserCommandDraft));
		expect(error).toMatchObject({ outcome: "not_delivered" });
		expect(["dynamic_approval_not_pending", "not_ready"]).toContain(
			(error as { readonly code: string }).code,
		);
		expect(socket.sent.some((request) => request.action === "command")).toBeFalse();
		void field;
	}

	const pendingCases: Array<readonly [string, BrowserDynamicApproval[]]> = [
		[
			"binding.commandId",
			[
				{
					...pending,
					binding: { ...pending.binding!, commandId: "other-command" },
				} as BrowserDynamicApproval,
			],
		],
		[
			"binding.paneId",
			[
				{
					...pending,
					binding: { ...pending.binding!, paneId: "other-pane" },
				} as BrowserDynamicApproval,
			],
		],
		[
			"binding.capturedLink",
			[
				{
					...pending,
					binding: {
						...pending.binding!,
						capturedLink: { threadId, childId, epoch: "other-epoch" },
					},
				} as BrowserDynamicApproval,
			],
		],
		[
			"state",
			[
				model.BrowserDynamicApprovalSchema.parse({
					...pending,
					state: "approved",
					decision: {
						outcome: "approved",
						identity,
						effectHash,
						decidedAtMs: createdAtMs + 1,
						cause: "person_approved",
					},
					binding: null,
				}),
			],
		],
		[
			"expiry",
			[
				{
					...pending,
					createdAtMs: clock - CODEX_APPROVAL_EXPIRY_MS,
					expiresAtMs: clock,
				} as BrowserDynamicApproval,
			],
		],
		["fabricated", []],
	];
	for (const [field, approvals] of pendingCases) {
		const transport = createBrowserWorkbenchTransport({ now: () => clock });
		transports.push(transport);
		const socket = new FakeSocket();
		await attach(
			transport,
			socket,
			snapshot({ lease: lease(260_000), dynamicApprovals: approvals }),
		);
		const error = await rejection(transport.command(dynamicDraft()));
		expect(error).toMatchObject({ outcome: "not_delivered" });
		expect(["dynamic_approval_not_pending", "not_ready"]).toContain(
			(error as { readonly code: string }).code,
		);
		expect(socket.sent.some((request) => request.action === "command")).toBeFalse();
		void field;
	}
});

test("lease expiry makes account, thread, queue, approval, dynamic, renew, and release paths inert", async () => {
	for (const clock of [200_000, 200_001]) {
		const transport = createBrowserWorkbenchTransport({ now: () => clock });
		transports.push(transport);
		const socket = new FakeSocket();
		await attach(
			transport,
			socket,
			snapshot({ lease: lease(200_000), dynamicApprovals: [pending] }),
		);
		const capabilities = transport.capabilities();
		for (const command of [
			"accountLogout",
			"start",
			"queueAdd",
			"approvalRespond",
			"dynamicApprovalRespond",
		] as const)
			expect(capabilities.supportsCommand(command)).toBeFalse();
		expect(capabilities.canCommand).toBeFalse();
		expect(capabilities.canRenewLease).toBeFalse();
		expect(capabilities.canReleaseLease).toBeFalse();
		const drafts = [
			{ command: "accountLogout" },
			{ command: "start", threadId, prompt: "start" },
			{ command: "queueAdd", prompt: "queue" },
			{
				command: "approvalRespond",
				requestId: "request-a",
				approvalId: null,
				response: { approvalKind: "apply_patch", decision: "approved" },
			},
			dynamicDraft(),
		] as unknown as BrowserCommandDraft[];
		for (const draft of drafts)
			expect(await rejection(transport.command(draft))).toMatchObject({
				code: "lease_expired",
			});
		expect(await rejection(transport.renewLease())).toMatchObject({
			code: "lease_expired",
		});
		expect(await rejection(transport.releaseLease())).toMatchObject({
			code: "lease_expired",
		});
		expect(socket.sent.map((request) => request.action)).toEqual(["subscribe"]);
	}
});
