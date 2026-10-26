import { expect, test } from "bun:test";

import { createWorkbenchBrowserConnections } from "#server/services/browser-socket/connections.ts";
import { createTabSessions } from "#server/services/sessions/browser-tabs.ts";
import { createGatewayHarness } from "#tests/server/support/gateway/support.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";

test("a replaced socket cannot acquire the replacement chat's lease", async () => {
	const fixture = createCodexWorkbenchGenerationFixture([]);
	const harness = createGatewayHarness(fixture.components.identity);
	const tabs = createTabSessions();
	const ingress = createWorkbenchBrowserConnections(
		tabs,
		(checkout) => checkout,
		() => undefined,
	);
	const remove = ingress.install({ ...fixture.components, gateway: harness.gateway });
	const first = {};
	const replacement = {};
	const registration = {
		chatId: harness.chatId,
		tabSessionId: harness.tabSessionId,
		checkout: "/work/project",
	};
	const messages: unknown[] = [];
	const transport = { send: async (message: unknown) => void messages.push(message) };
	try {
		ingress.port.accept(first, harness.browserId, registration);
		ingress.port.accept(replacement, harness.browserId, {
			...registration,
			chatId: "replacement-chat",
		});
		await expect(
			ingress.port.handle(
				first,
				harness.browserId,
				{ type: "codex_workbench_request", requestId: "stale", action: "claimLease" },
				transport,
			),
		).rejects.toThrow();
		await ingress.port.close(first, harness.browserId);
		expect(tabs.of(harness.browserId)).toBe(harness.tabSessionId);
		await ingress.port.handle(
			replacement,
			harness.browserId,
			{ type: "codex_workbench_request", requestId: "replacement", action: "claimLease" },
			transport,
		);
		expect(messages).toContainEqual(
			expect.objectContaining({ requestId: "replacement", ok: true }),
		);
	} finally {
		remove();
		tabs.forgetAll();
		await harness.gateway.dispose();
		await fixture.components.sessions.dispose();
	}
});
