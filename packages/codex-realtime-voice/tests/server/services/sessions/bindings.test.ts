import { expect, test } from "bun:test";

import { TEST_CALLBACK_POLICY } from "#tests/runtime/support/host.ts";
import { createSessionComponentsFixture } from "#tests/server/support/generation/session-fixture.ts";
import { createSessionBindings } from "#server/services/sessions/bindings.ts";
import { DEFAULT_VOICE_AGENT_IDENTITY } from "#runtime/protocol/host/identity.ts";

/**
 * The bindings of a tab session whose scope stops what it is told to.
 * @returns The bindings, and the checkouts the scope was asked to stop.
 */
function bindingsOfTab() {
	const stopped: (string | null)[] = [];
	const scope = {
		id: "tab-1",
		state: { currentCoordinatorCall: null },
		workhorses: () => [],
		stopWork: async (checkout: string | null) => {
			stopped.push(checkout);
			return [{ checkout: "/work/payments", outcome: "interrupted" as const }];
		},
	};
	const bindings = createSessionBindings({
		scope,
		server: {
			host: {
				instructions: { coordinator: { identity: DEFAULT_VOICE_AGENT_IDENTITY } },
				sessionContextFor: () => ({
					publisher: createSessionComponentsFixture([]).semanticPublisher,
					callbacks: TEST_CALLBACK_POLICY,
				}),
			},
		},
		shared: {},
		coordinatorDirectory: "/state/coordinator",
		publishProjection: () => undefined,
	} as never);
	return { bindings, stopped };
}

test("a coordinator's stop reaches the stop of every workhorse of its tab session", async () => {
	const { bindings, stopped } = bindingsOfTab();
	const tools = bindings.coordinatorTools({ coordinator: null } as never);

	expect(await tools.stopWork()).toEqual([{ checkout: "/work/payments", outcome: "interrupted" }]);
	expect(stopped).toEqual([null]);
});
