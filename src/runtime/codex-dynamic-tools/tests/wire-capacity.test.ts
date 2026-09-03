import { expect, test } from "bun:test";

import { createCodexDynamicTools } from "../index.js";
import { optionsFor, requestFor, setupAuthorities } from "./support.js";

test("releases ordinary wire joins across more than transport retention capacity", async () => {
	const { authorities, caller } = setupAuthorities();
	const fixture = optionsFor(authorities, caller);
	fixture.session.threadListPages.set(null, {
		data: [],
		nextCursor: null,
		backwardsCursor: null,
	});
	fixture.session.loadedListPages.set(null, { data: [], nextCursor: null });
	const tools = createCodexDynamicTools(fixture.options);

	for (let index = 0; index < 300; index++) {
		await tools.dispatch(
			requestFor(authorities, caller, "list_threads", { limit: 1 }, `ordinary-${index}`),
		);
		expect(tools.inspectMutationQuarantine().ordinaryInFlightWireCount).toBe(0);
	}

	expect(fixture.transportResponses).toHaveLength(300);
	expect(fixture.session.calls).toHaveLength(600);
	expect(tools.inspectMutationQuarantine()).toMatchObject({
		epochCount: 0,
		wireCount: 0,
		ordinaryInFlightWireCount: 0,
	});
});
