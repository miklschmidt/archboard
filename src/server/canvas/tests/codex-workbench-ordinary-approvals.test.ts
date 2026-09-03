import { expect, test } from "bun:test";

import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserActionContext } from "../../codex-workbench/index.js";
import { createCanvasOrdinaryApprovalActions } from "../codex-workbench-adapters.js";

test("browser disconnect settles and immediately acknowledges its ordinary approvals", async () => {
	const paneId = "pane-ordinary";
	const identity = createIdentityAuthority();
	const responses: unknown[] = [];
	const broker = createCodexApprovalBroker({
		identity,
		transport: {
			respond: async (_request, _owner, response) => void responses.push(response),
		},
		getCurrentBinding: () => ({ link: `pane:${paneId}` }),
	});
	try {
		const requestId = identity.decoder.adoptJsonRpcRequestId("request-disconnect-owner");
		const pending = broker.receive({
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			requestId,
			correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
			method: "item/commandExecution/requestApproval",
			owner: "codex-approvals",
			params: {
				threadId: "thread-disconnect-owner",
				turnId: "turn-disconnect-owner",
				itemId: "item-disconnect-owner",
				kind: "command",
				startedAtMs: 10,
				approvalId: "approval-disconnect-owner",
				environmentId: null,
				reason: "Disconnect test",
				networkApprovalContext: null,
				command: "echo disconnect",
				cwd: "/workspace",
				commandActions: null,
				additionalPermissions: null,
				proposedExecpolicyAmendment: null,
				proposedNetworkPolicyAmendments: null,
				availableDecisions: ["accept", "decline"],
			},
		});
		const actions = createCanvasOrdinaryApprovalActions(broker);
		const context: BrowserActionContext = {
			browserId: "browser-ordinary",
			connection: Object.freeze({ socket: "ordinary" }),
			paneId,
			commandId: identity.issuer.mintBrowserCommandId(),
			childId: pending.child,
			epoch: pending.epoch,
			linkRevision: 1,
			link: {
				kind: "thread_link",
				state: "executable",
				childId: pending.child,
				epoch: pending.epoch,
				threadId: pending.threadId,
				source: "appServer",
				status: "idle",
				loaded: true,
				canAcceptDirectInput: true,
				reason: null,
			},
		};

		await actions.onBrowserDisconnect?.(context, "browser_disconnected");

		expect(responses).toHaveLength(1);
		expect(broker.inspect()).toEqual([]);
	} finally {
		broker.dispose();
	}
});
