import { expect, test } from "bun:test";

import { createSessionBindings } from "#server/sessions/services/bindings.ts";
import { DEFAULT_VOICE_AGENT_IDENTITY } from "#runtime/host/protocol/identity.ts";

/**
 * The bindings of a tab session whose scope stops what it is told to.
 * @param narrative The host's narrative adapter, if it has one.
 * @returns The bindings, and the checkouts the scope was asked to stop.
 */
function bindingsOfTab(narrative?: { readonly unattended: (narrative: unknown) => boolean }) {
	const stopped: (readonly [string | null, unknown])[] = [];
	const scope = {
		id: "tab-1",
		state: { currentCoordinatorCall: null },
		workhorses: () => [],
		stopWork: async (checkout: string | null, askedBy: unknown) => {
			stopped.push([checkout, askedBy]);
			return [{ checkout: "/work/payments", outcome: "stopped" as const, remaining: [] }];
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

test("a coordinator's stop reaches the stop of every workhorse of its tab session, with the turn that asked", async () => {
	const { bindings, stopped } = bindingsOfTab();
	const tools = bindings.coordinatorTools({ coordinator: null } as never);

	expect(await tools.stopWork("coordinator-turn" as never)).toEqual([
		{ checkout: "/work/payments", outcome: "stopped", remaining: [] },
	]);
	expect(stopped).toEqual([[null, "coordinator-turn"]]);
});

test("a live session whose narrative nobody listens to gives the coordinator no workhorse outcome", async () => {
	const { bindings } = bindingsOfTab({ unattended: (narrative) => narrative === "tour" });
	const created = { realtime: { narrative: () => "tour" } };
	const port = bindings.callbacks(created as never).coordinatorTurn;

	expect(
		await port?.report({ threadId: "coordinator" as never, news: "News.", situation: "ended" }),
	).toBe("unattended");
});
