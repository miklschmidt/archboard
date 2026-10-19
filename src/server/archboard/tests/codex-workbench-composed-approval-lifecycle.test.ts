import { expect, test } from "bun:test";

import { parseTabSessionId } from "@archboard/workbench/tab-session";
import { type BrowserGatewayMessage } from "@archboard/workbench/browser-gateway";
import { composeCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import { askApproval, createApprovalGateway } from "./support/codex-workbench-approval-gateway.js";
import { createCodexWorkbenchGenerationFixture } from "./support/codex-workbench-generation-fixture.js";

test("composed child exit publishes one settled approval before closing presenters", async () => {
	const events: string[] = [];
	const fixture = createCodexWorkbenchGenerationFixture(events);
	const identity = fixture.components.identity;
	const paneId = "pane-child-exit";
	const tabSessionId = parseTabSessionId("tab-one")!;
	const threadId = identity.identity.decoder.adoptThreadId("thread-child-exit");
	const { approvals, gateway, responses } = createApprovalGateway(identity, tabSessionId, threadId);
	fixture.replaceApprovals(approvals);
	fixture.replaceGateway(gateway);
	const generation = await composeCodexWorkbenchGeneration({
		identityLedger: fixture.identityLedger,
		factories: fixture.factories,
		hooks: fixture.hooks,
	});
	try {
		const connection = gateway.connect("browser-child-exit", paneId, tabSessionId);
		const pending = askApproval(approvals, identity, threadId, "child-exit");
		connection.snapshot();
		connection.claimLease();
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => messages.push(message));

		await generation.retireChild({
			child: pending.child,
			epoch: pending.epoch,
			code: 1,
			signal: null,
		});

		expect(responses).toEqual([{ result: { decision: "cancel" } }]);
		expect(
			messages.filter((message) => {
				const text = JSON.stringify(message);
				return text.includes('"state":"stale"') && text.includes('"outcome":"delivered"');
			}),
		).toHaveLength(1);
		expect(approvals.inspect()).toEqual([]);
		expect(() => connection.snapshot()).toThrow("disposed");
	} finally {
		await generation.stop("child_exit");
		generation.finishStop();
	}
});
