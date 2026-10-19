import { expect, test } from "bun:test";

import { createCodexApprovalBroker } from "#runtime/services/approvals/broker.ts";
import {
	createIdentityAuthorities,
	createIdentityAuthority,
} from "@archboard/codex-app-server/identity";
import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import {
	type BrowserActionContext,
	type BrowserApprovalCommand,
} from "#server/protocol/gateway/contract.ts";
import {
	cancelTabSessionApprovals,
	createServerOrdinaryApprovalActions,
} from "#server/services/actions/ordinary-approvals.ts";
import {
	askApproval,
	createApprovalGateway,
} from "#tests/server/support/generation/approval-gateway.ts";

for (const outcome of ["delivered", "not_delivered", "outcome_unknown"] as const) {
	test(`ordinary approval actions preserve the broker ${outcome} outcome`, async () => {
		const identity = createIdentityAuthority();
		const broker = createCodexApprovalBroker({
			identity,
			transport: {
				respond: async () => {
					if (outcome === "delivered") {
						return;
					}
					throw outcome === "not_delivered"
						? { accepted: false, outcome, reason: "backpressure" }
						: { accepted: true, outcome, reason: "write-error" };
				},
			},
			getCurrentBinding: () => ({ link: "pane:outcome" }),
		});
		try {
			const requestId = identity.decoder.adoptJsonRpcRequestId(`request-${outcome}`);
			const pending = broker.receive({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				requestId,
				correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
				method: "item/commandExecution/requestApproval",
				owner: "codex-approvals",
				params: {
					threadId: `thread-${outcome}`,
					turnId: `turn-${outcome}`,
					itemId: `item-${outcome}`,
					kind: "command",
					startedAtMs: 10,
					approvalId: `approval-${outcome}`,
					environmentId: null,
					reason: "Settlement outcome test",
					networkApprovalContext: null,
					command: "echo outcome",
					cwd: "/workspace",
					commandActions: null,
					additionalPermissions: null,
					proposedExecpolicyAmendment: null,
					proposedNetworkPolicyAmendments: null,
					availableDecisions: ["accept", "decline"],
				},
			});
			const actions = createServerOrdinaryApprovalActions(broker);
			const command = {
				kind: "browser_command",
				commandId: identity.issuer.mintBrowserCommandId(),
				paneId: "pane-outcome",
				childId: pending.child,
				epoch: pending.epoch,
				command: "approvalRespond",
				requestId,
				approvalId: pending.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			} satisfies BrowserApprovalCommand;
			const result = await actions.resolve(command, {} as BrowserActionContext);

			expect(result).toEqual({ outcome });
		} finally {
			broker.dispose();
		}
	});
}

test("the tab session's end settles its approvals; a disconnect does not", async () => {
	const identity = createIdentityAuthorities();
	const tabSessionId = parseTabSessionId("tab-one")!;
	const threadId = identity.identity.decoder.adoptThreadId("thread-ending");
	const { approvals, gateway, responses } = createApprovalGateway(identity, tabSessionId, threadId);
	try {
		const pending = askApproval(approvals, identity, threadId, "ending");
		const first = gateway.connect("browser-one", "A", tabSessionId);
		first.claimLease();
		expect(first.snapshot().snapshot.approvals).toHaveLength(1);

		// The tab's last pane goes; a reload within the grace brings it back.
		await first.close();
		expect(responses).toEqual([]);
		const reloaded = gateway.connect("browser-one", "A", tabSessionId);
		expect(reloaded.snapshot().snapshot.approvals).toEqual([
			expect.objectContaining({ requestId: pending.requestId }),
		]);
		await reloaded.close();

		// Nobody came back within the grace: the session's end answers Codex and retires it.
		await cancelTabSessionApprovals(approvals, tabSessionId);
		expect(responses).toEqual([{ result: { decision: "cancel" } }]);
		expect(approvals.inspect()).toEqual([]);
	} finally {
		await gateway.dispose();
		approvals.dispose();
	}
});
