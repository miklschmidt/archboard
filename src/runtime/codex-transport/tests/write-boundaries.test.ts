import { describe, expect, test } from "bun:test";

import { CodexTransportRequestError } from "../errors.js";
import { captureRejection, createHarness } from "./fake-child.js";

describe("Codex app-server write boundaries", () => {
	test("classifies an accepted writer failure as outcome unknown", async () => {
		const failed = createHarness();
		try {
			failed.child.stdin.failNext = true;
			const error = await captureRejection(
				failed.transport.request("turn/steer", {}, { retryEligible: true }),
			);
			expect(error).toBeInstanceOf(CodexTransportRequestError);
			expect(error).toMatchObject({
				reason: "write-error",
				outcome: "outcome_unknown",
				accepted: true,
				retryEligible: true,
			});
			expect(failed.transport.inspect().state).toBe("closed");
		} finally {
			await failed.close();
		}
	});
});
