import { expect, test } from "bun:test";

import { createSessionBindings } from "#server/services/sessions/bindings.ts";
import { DEFAULT_VOICE_AGENT_IDENTITY } from "#runtime/protocol/host/identity.ts";

/**
 * The bindings of a tab session whose scope stops what it is told to.
 * @param narrative The host's narrative adapter, if it has one.
 * @returns The bindings, and the checkouts the scope was asked to stop.
 */
function bindingsOfTab(narrative?: { readonly unattended: (narrative: unknown) => boolean }) {
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
				...(narrative === undefined ? {} : { narrative }),
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

test("a live session whose narrative nobody listens to gives the coordinator no workhorse outcome", async () => {
	const { bindings } = bindingsOfTab({ unattended: (narrative) => narrative === "tour" });
	const created = { realtime: { narrative: () => "tour" } };
	const port = bindings.callbacks(created as never).coordinatorTurn;

	expect(
		await port?.report({ threadId: "coordinator" as never, news: "News.", situation: "ended" }),
	).toBe("unattended");
});
