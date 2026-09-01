import { describe, expect, test } from "bun:test";

import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { TransportServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserActionContext, BrowserDisconnectReason } from "../../codex-workbench/index.js";
import { createCanvasOrdinaryApprovalActions } from "../codex-workbench-adapters.js";

function requestFamilyTable(
	identity: ReturnType<typeof createIdentityAuthorities>,
	threadId: string,
): readonly TransportServerRequest[] {
	const envelope = (method: string, label: string, params: unknown): TransportServerRequest => {
		const requestId = identity.identity.decoder.adoptJsonRpcRequestId(`request-${label}`);
		return {
			child: identity.identity.validator.childId,
			epoch: identity.identity.validator.epoch,
			requestId,
			correlation: identity.identity.decoder.createWireRequestCorrelation({ requestId }),
			method,
			params,
			owner: "codex-approvals",
		} as TransportServerRequest;
	};
	const item = (label: string) => ({
		threadId,
		turnId: `turn-${label}`,
		itemId: `item-${label}`,
	});
	return [
		envelope("item/commandExecution/requestApproval", "command", {
			...item("command"),
			kind: "command",
			startedAtMs: 10,
			approvalId: "approval-command",
			environmentId: null,
			reason: "Run command",
			networkApprovalContext: null,
			command: "echo command",
			cwd: "/workspace",
			commandActions: null,
			additionalPermissions: null,
			proposedExecpolicyAmendment: null,
			proposedNetworkPolicyAmendments: null,
			availableDecisions: ["accept", "decline"],
		}),
		envelope("item/fileChange/requestApproval", "file", {
			...item("file"),
			startedAtMs: 10,
			reason: "Change file",
			grantRoot: "/workspace",
		}),
		envelope("item/tool/requestUserInput", "input", {
			...item("input"),
			questions: [
				{
					id: "input-0",
					header: "Question",
					question: "Answer?",
					isOther: false,
					isSecret: false,
					options: null,
				},
			],
			isBlocking: false,
			autoResolutionMs: null,
		}),
		envelope("mcpServer/elicitation/request", "elicitation", {
			threadId,
			turnId: null,
			serverName: "server-elicitation",
			mode: "form",
			_meta: null,
			message: "Provide input",
			requestedSchema: { type: "object", properties: {}, required: [] },
		}),
		envelope("item/permissions/requestApproval", "permissions", {
			...item("permissions"),
			environmentId: null,
			startedAtMs: 10,
			cwd: "/workspace",
			reason: "Grant permission",
			permissions: {
				network: { enabled: true },
				fileSystem: { read: ["/workspace"], write: null },
			},
		}),
		envelope("applyPatchApproval", "patch", {
			conversationId: threadId,
			callId: "call-patch",
			fileChanges: { "/workspace/file.ts": { type: "add", content: "export {};" } },
			reason: "Apply patch",
			grantRoot: "/workspace",
		}),
		envelope("execCommandApproval", "exec", {
			conversationId: threadId,
			callId: "call-exec",
			approvalId: "approval-exec",
			command: ["echo", "exec"],
			cwd: "/workspace",
			reason: "Exec command",
			parsedCmd: [{ type: "unknown", cmd: "echo exec" }],
		}),
	];
}

describe("ordinary approval browser ownership", () => {
	for (const [reason, authoredReason] of [
		["browser_disconnected", "browser disconnected"],
		["child_disconnected", "child disconnected"],
		["gateway_shutdown", "host shutdown"],
	] as const satisfies readonly (readonly [BrowserDisconnectReason, string])[]) {
		test(`settles every family exactly once on ${reason}`, async () => {
			const identity = createIdentityAuthorities();
			const threadId = identity.identity.decoder.adoptThreadId(`thread-${reason}`);
			const responses: TransportServerRequest[] = [];
			const approvals = createCodexApprovalBroker({
				identity: identity.identity,
				listenerOwnership: "composition",
				transport: {
					respond: async (request) => void responses.push(request),
				},
				getCurrentBinding: () => ({ link: "pane:pane-approval" }),
			});
			try {
				const pending = requestFamilyTable(identity, String(threadId)).map((request) =>
					approvals.receive(request),
				);
				expect(pending.map(({ family }) => family)).toEqual([
					"command_execution",
					"file_change",
					"user_input",
					"elicitation",
					"permissions",
					"apply_patch",
					"exec_command",
				]);
				const actions = createCanvasOrdinaryApprovalActions(approvals);
				const context = {
					paneId: "pane-approval",
					childId: identity.identity.validator.childId,
					epoch: identity.identity.validator.epoch,
					link: {
						kind: "thread_link",
						state: "executable",
						childId: identity.identity.validator.childId,
						epoch: identity.identity.validator.epoch,
						threadId,
						source: "appServer",
						status: "idle",
						loaded: true,
						canAcceptDirectInput: true,
						reason: null,
					},
				} as BrowserActionContext;
				await actions.onBrowserDisconnect?.({ ...context, paneId: "pane-unrelated" }, reason);
				expect(responses).toHaveLength(0);
				expect(approvals.inspect().every(({ state }) => state === "pending")).toBeTrue();
				await Promise.all([
					actions.onBrowserDisconnect?.(context, reason),
					actions.onBrowserDisconnect?.(context, reason),
				]);
				expect(responses).toHaveLength(7);
				for (const snapshot of approvals.inspect()) {
					expect(snapshot).toMatchObject({
						state: "cancelled",
						outcome: "delivered",
						reason: authoredReason,
					});
					expect(await approvals.cancel(snapshot.requestId, "late duplicate")).toMatchObject({
						reason: authoredReason,
					});
				}
				expect(responses).toHaveLength(7);
			} finally {
				approvals.dispose();
			}
		});
	}
});
