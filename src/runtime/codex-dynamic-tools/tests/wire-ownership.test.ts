import { describe, expect, test } from "bun:test";

import { createCodexDynamicTools } from "../index.js";
import { optionsFor, requestFor, setupAuthorities } from "./support.js";

describe("codex dynamic ordinary wire ownership", () => {
	test("joins a distinct-object duplicate request id before normal success writes", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.session.threadListPages.set(null, {
			data: [],
			nextCursor: null,
			backwardsCursor: null,
		});
		fixture.session.loadedListPages.set(null, { data: [], nextCursor: null });
		const tools = createCodexDynamicTools(fixture.options);
		const request = requestFor(authorities, caller, "list_threads", { limit: 1 });

		const first = tools.dispatch(request);
		const duplicate = tools.dispatch({ ...request });
		expect(duplicate).toBe(first);
		expect(await duplicate).toEqual(await first);
		expect(fixture.session.calls.map(({ method }) => method)).toEqual([
			"thread/list",
			"thread/loaded/list",
		]);
		expect(fixture.transportResponses).toHaveLength(1);
		expect(tools.inspectMutationQuarantine().ordinaryInFlightWireCount).toBe(0);
		let refusal: unknown;
		try {
			await tools.dispatch({ ...request });
		} catch (error) {
			refusal = error;
		}
		expect(refusal).toMatchObject({ retryEligible: false });
		expect(fixture.session.calls).toHaveLength(2);
		expect(fixture.transportResponses).toHaveLength(1);
	});

	test("joins a distinct-object duplicate request id before a normal refusal writes", async () => {
		const { authorities, caller } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		const tools = createCodexDynamicTools(fixture.options);
		const request = requestFor(authorities, caller, "list_threads", {});
		const invalid = { ...request, params: { ...request.params, unexpected: true } };

		const first = tools.dispatch(invalid);
		const duplicate = tools.dispatch({ ...invalid });
		expect(duplicate).toBe(first);
		expect(await duplicate).toEqual(await first);
		expect(fixture.session.calls).toHaveLength(0);
		expect(fixture.transportResponses).toHaveLength(1);
		expect(tools.inspectMutationQuarantine().ordinaryInFlightWireCount).toBe(0);
	});
});
