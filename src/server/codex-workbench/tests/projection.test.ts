import { expect, test } from "bun:test";

import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type {
	HumanApprovalMethod,
	TransportServerRequest,
} from "../../../runtime/codex-transport/server-requests.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
	type CodexSettingsProjectionInput,
} from "../index.js";
import { createGatewayHarness } from "./support.js";

function requestEnvelope<Method extends HumanApprovalMethod>(
	identity: IdentityAuthority,
	method: Method,
	params: unknown,
	label: string,
): Extract<TransportServerRequest, { readonly method: Method }> {
	const requestId = identity.decoder.adoptJsonRpcRequestId(`projection-${label}`);
	return {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId,
		correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
		method,
		params,
		owner: "codex-approvals",
	} as Extract<TransportServerRequest, { readonly method: Method }>;
}

function itemParams(label: string) {
	return { threadId: `thread-${label}`, turnId: `turn-${label}`, itemId: `item-${label}` };
}

function approvalRequests(identity: IdentityAuthority): readonly TransportServerRequest[] {
	const label = "all-families";
	return [
		requestEnvelope(
			identity,
			"item/commandExecution/requestApproval",
			{
				...itemParams(label),
				kind: "command",
				startedAtMs: 10,
				approvalId: `approval-${label}`,
				environmentId: null,
				reason: "Run command",
				networkApprovalContext: null,
				command: "echo projection",
				cwd: "/workspace",
				commandActions: null,
				additionalPermissions: null,
				proposedExecpolicyAmendment: null,
				proposedNetworkPolicyAmendments: null,
				availableDecisions: ["accept", "decline"],
			},
			"command",
		),
		requestEnvelope(
			identity,
			"item/fileChange/requestApproval",
			{ ...itemParams(label), startedAtMs: 10, reason: "Change file", grantRoot: "/workspace" },
			"file",
		),
		requestEnvelope(
			identity,
			"item/tool/requestUserInput",
			{
				...itemParams(label),
				questions: [
					{
						id: "question",
						header: "Question",
						question: "Answer?",
						isOther: false,
						isSecret: false,
						options: null,
					},
				],
				isBlocking: false,
				autoResolutionMs: null,
			},
			"user-input",
		),
		requestEnvelope(
			identity,
			"mcpServer/elicitation/request",
			{
				threadId: `thread-${label}`,
				turnId: null,
				serverName: "projection-server",
				mode: "form",
				_meta: null,
				message: "Provide a name",
				requestedSchema: {
					type: "object",
					properties: { name: { type: "string", default: "Ada" } },
					required: ["name"],
				},
			},
			"elicitation",
		),
		permissionRequest(identity, label),
		requestEnvelope(
			identity,
			"applyPatchApproval",
			{
				conversationId: `thread-${label}`,
				callId: "patch-call",
				fileChanges: { "/workspace/file.ts": { type: "add", content: "export {};" } },
				reason: "Apply patch",
				grantRoot: "/workspace",
			},
			"patch",
		),
		requestEnvelope(
			identity,
			"execCommandApproval",
			{
				conversationId: `thread-${label}`,
				callId: "exec-call",
				approvalId: "exec-approval",
				command: ["echo", "projection"],
				cwd: "/workspace",
				reason: "Run legacy command",
				parsedCmd: [{ type: "unknown", cmd: "echo projection" }],
			},
			"exec",
		),
	];
}

function permissionRequest(identity: IdentityAuthority, label: string): TransportServerRequest {
	return requestEnvelope(
		identity,
		"item/permissions/requestApproval",
		{
			...itemParams(label),
			environmentId: null,
			startedAtMs: 10,
			cwd: "/private/permission-cwd",
			reason: "Grant permission",
			permissions: {
				network: { enabled: true },
				fileSystem: {
					read: ["/private/read"],
					write: ["/private/write"],
					entries: [{ path: { type: "path", path: "/private/denied" }, access: "deny" }],
					futurePrivateField: "/private/future",
				},
			},
		},
		"permissions",
	);
}

function projectionInput(
	view: ReturnType<ReturnType<typeof createCodexApprovalBroker>["view"]>,
): BrowserProjectionInput {
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "private@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
			},
		},
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: view.request.child,
			epoch: view.request.epoch,
			threadId: view.request.threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [view],
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "ready",
			threadId: view.request.threadId,
			effective: { model: "gpt-5.6-sol", effort: "xhigh", serviceTier: "priority" },
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: true,
			generation: null,
			coordinatorState: "ready",
			transcript: [],
		},
		lease: null,
		operation: null,
	};
}

test("the sole public projection owns all seven ordinary approval presentations", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const broker = createCodexApprovalBroker({
		identity: authorities.identity,
		transport: { respond: () => Promise.resolve() },
	});
	try {
		const projectedFamilies: string[] = [];
		for (const request of approvalRequests(authorities.identity)) {
			const pending = broker.receive(request);
			const result = projectCodexBrowserState(
				model,
				projectionInput(broker.view(pending.requestId)),
			);
			expect(result.tag).toBe("projected");
			if (result.tag !== "projected") throw new Error("approval projection was refused");
			projectedFamilies.push(result.snapshot.approvals[0]!.approvalKind);
		}
		expect(projectedFamilies).toEqual([
			"command_execution",
			"file_change",
			"user_input",
			"elicitation",
			"permissions",
			"apply_patch",
			"exec_command",
		]);
	} finally {
		broker.dispose();
	}
});

test("the sole projection strips private account and settings fields and refuses secrets", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const broker = createCodexApprovalBroker({
		identity: authorities.identity,
		transport: { respond: () => Promise.resolve() },
	});
	try {
		const pending = broker.receive(approvalRequests(authorities.identity)[0]!);
		const input = projectionInput(broker.view(pending.requestId));
		const settings = {
			cwd: "/private/vendor/checkout",
			model: "gpt-5.6-sol",
			effort: "xhigh",
			serviceTier: "priority",
			approvalPolicy: "on-request" as const,
			approvalsReviewer: "user" as const,
			sandboxPolicy: {
				type: "workspaceWrite" as const,
				writableRoots: ["/private/vendor/root"],
				networkAccess: true,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			},
			activePermissionProfile: null,
			modelProvider: "private-provider",
		};
		const result = projectCodexBrowserState(model, {
			...input,
			settings: [
				{
					kind: "codex_thread_settings",
					owner: "workhorse",
					settings: settings satisfies CodexSettingsProjectionInput["settings"],
				},
			],
		});
		expect(result.tag).toBe("projected");
		if (result.tag !== "projected") throw new Error("settings projection was refused");
		expect(result.snapshot.account).toEqual({
			kind: "account",
			state: "ready",
			accountType: "chatgpt",
		});
		expect(result.snapshot.settings[0]?.sandbox).toEqual({
			mode: "workspace_write",
			network: "enabled",
		});
		const wire = JSON.stringify(result.snapshot);
		for (const privateValue of [
			"private@example.test",
			"/private/vendor/checkout",
			"/private/vendor/root",
			"private-provider",
		])
			expect(wire).not.toContain(privateValue);

		const secretAccount = { ...input.account, apiKey: "sk-browser-leak" };
		const secret = projectCodexBrowserState(model, {
			...input,
			account: secretAccount,
		} as BrowserProjectionInput);
		expect(secret).toEqual({
			tag: "refused",
			reason: "secret_input",
			message: "The browser projection contains a secret-bearing field.",
		});
		expect(JSON.stringify(secret)).not.toContain("sk-browser-leak");
	} finally {
		broker.dispose();
	}
});

test("the production gateway strips permission cwd, paths, and unreviewed vendor fields", () => {
	const harness = createGatewayHarness();
	const broker = createCodexApprovalBroker({
		identity: harness.authorities.identity,
		transport: { respond: () => Promise.resolve() },
	});
	try {
		const pending = broker.receive(
			permissionRequest(harness.authorities.identity, "gateway-thread"),
		);
		const view = broker.view(pending.requestId);
		const linkedView = {
			...view,
			request: { ...view.request, threadId: harness.threadId },
			snapshot: { ...view.snapshot, threadId: harness.threadId },
		};
		harness.setOrdinaryApproval(linkedView);
		const [approval] = harness.gateway.connect(harness.browserId, harness.paneId).snapshot()
			.snapshot.approvals;
		expect(approval).toMatchObject({
			approvalKind: "permissions",
			requestedScope: { network: true, fileAccess: ["deny", "read", "write"] },
		});
		const wire = JSON.stringify(approval);
		for (const privateValue of [
			"/private/permission-cwd",
			"/private/read",
			"/private/write",
			"/private/denied",
			"/private/future",
			"futurePrivateField",
		])
			expect(wire).not.toContain(privateValue);
		expect(approval).not.toHaveProperty("cwd");
	} finally {
		broker.dispose();
		harness.gateway.dispose();
	}
});
