import { expect, test } from "bun:test";

import { createGatewayHarness } from "#tests/server/support/gateway/support.ts";

test("gateway invokes projection retirement once for the exact closed connection", async () => {
	const retired: { browserId: string; chatId: string; connection: object; reason: string }[] = [];
	const value = createGatewayHarness(undefined, undefined, (context, reason) => {
		retired.push({ ...context, reason });
	});
	const connection = {};
	try {
		value.open(connection);
		await value.gateway.closeConnection(value.browserId, value.chatId, connection);
		await value.gateway.closeConnection(value.browserId, value.chatId, connection);
		expect(retired).toEqual([
			{
				browserId: value.browserId,
				chatId: value.chatId,
				connection,
				reason: "browser_disconnected",
			},
		]);
	} finally {
		await value.gateway.dispose();
	}
});
