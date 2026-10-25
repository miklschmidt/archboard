import { expect, test } from "bun:test";

import { parseTabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { type BrowserGatewayMessage } from "#shared/protocol/gateway-envelope.ts";
import { composeCodexWorkbenchGeneration } from "#server/services/generation/compose.ts";
import {
	askApproval,
	createApprovalGateway,
} from "#tests/server/support/generation/approval-gateway.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";

test("composed child exit publishes one settled approval before closing presenters", async () => {
	const events: string[] = [];
	const fixture = createCodexWorkbenchGenerationFixture(events);
	const identity = fixture.components.identity;
	const chatId = "chat-child-exit";
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
		const connection = gateway.connect("browser-child-exit", chatId, tabSessionId);
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
