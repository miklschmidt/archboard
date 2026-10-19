import { expect, test } from "bun:test";

import { CODEX_APP_SERVER_CAPACITY } from "@archboard/codex-app-server/app-server-capacity";
import { CodexTransportRequestError } from "../errors.js";
import { captureRejection, createHarness } from "./fake-child.js";

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
