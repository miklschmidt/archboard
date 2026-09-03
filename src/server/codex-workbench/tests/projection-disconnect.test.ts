import { expect, test } from "bun:test";

import { createGatewayHarness } from "./support.js";

test("gateway invokes projection retirement once for the exact closed connection", async () => {
	const retired: { browserId: string; paneId: string; connection: object; reason: string }[] = [];
	const value = createGatewayHarness(undefined, undefined, (context, reason) => {
		retired.push({ ...context, reason });
	});
	const connection = {};
	try {
		value.gateway.connect(value.browserId, value.paneId, connection);
		await value.gateway.closeConnection(value.browserId, value.paneId, connection);
		await value.gateway.closeConnection(value.browserId, value.paneId, connection);
		expect(retired).toEqual([
			{
				browserId: value.browserId,
				paneId: value.paneId,
				connection,
				reason: "browser_disconnected",
			},
		]);
	} finally {
		await value.gateway.dispose();
	}
});
