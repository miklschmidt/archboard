import { expect, test } from "bun:test";

import { CODEX_APP_SERVER_CAPACITY } from "#shared/constants/app-server-capacity.ts";
import { CodexTransportRequestError } from "#runtime/clients/transport-errors.ts";
import { captureRejection, createHarness } from "#tests/runtime/support/transport-fake-child.ts";

test("refuses a request larger than the app-server frame capacity before writing", async () => {
	const oversized = createHarness();
	try {
		const error = await captureRejection(
			oversized.transport.request("turn/steer", {
				input: "x".repeat(CODEX_APP_SERVER_CAPACITY.frameBytes),
			}),
		);
		expect(error).toBeInstanceOf(CodexTransportRequestError);
		expect(error).toMatchObject({
			reason: "frame-too-large",
			outcome: "not_delivered",
			accepted: false,
			retryEligible: true,
		});
	} finally {
		await oversized.close();
	}
});
