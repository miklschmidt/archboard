import { expect, test } from "bun:test";

import {
	closeBroker,
	commandRequest,
	testBroker,
} from "#tests/runtime/services/approvals/support.ts";

test("the broker leaves request and exit listeners to composition when configured", () => {
	const fixture = testBroker("delivered", { listenerOwnership: "composition" });
	fixture.port.emit(commandRequest(fixture.identity, "composition-owner"));
	fixture.port.emitExit(fixture.identity);
	expect(fixture.broker.inspect()).toEqual([]);
	closeBroker(fixture.broker);
});
