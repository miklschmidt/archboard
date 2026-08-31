import { describe, expect, test } from "bun:test";

import { CodexTransportRequestError } from "../index.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import { closeTransport, createHarness } from "./fake-child.js";

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the operation to reject");
}

describe("Codex app-server write boundaries", () => {
	test("classifies pre-write rejection and accepted writer failure separately", async () => {
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
			await closeTransport(oversized.transport);
		}

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
			await closeTransport(failed.transport);
		}
	});
});
