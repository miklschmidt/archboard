import { describe, expect, test } from "bun:test";

import { CodexTransportRequestError } from "../errors.js";
import {
	captureRejection,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	sendJson,
} from "./fake-child.js";

describe("Codex app-server malformed routing contract", () => {
	test("settles a pending id-only frame before reverse-request fallback", async () => {
		const { child, transport, close } = createHarness();
		try {
			const pending = transport.request("turn/steer", {});
			const { id } = frameAt(child, 0);
			const rejection = captureRejection(pending);
			sendJson(child, { id });
			await flushStreams();

			const error = await rejection;
			expect(error).toBeInstanceOf(CodexTransportRequestError);
			expect(error).toMatchObject({
				reason: "malformed-response",
				outcome: "outcome_unknown",
			});
			expect(transport.inspect().pendingRequests).toBe(0);
			let wroteReverseRequestError = false;
			for (const frame of frames(child)) {
				const frameError = frame["error"];
				if (
					frame["id"] === id &&
					typeof frameError === "object" &&
					frameError !== null &&
					"code" in frameError &&
					frameError.code === -32_600
				) {
					wroteReverseRequestError = true;
				}
			}
			expect(wroteReverseRequestError).toBeFalse();

			const recovered = transport.request("turn/steer", {});
			const recoveredId = frameAt(child, 1)["id"];
			sendJson(child, { id: recoveredId, result: { turnId: "recovered" } });
			const recoveredResponse = await recovered;
			expect(recoveredResponse.result).toEqual({ turnId: "recovered" });
		} finally {
			await close();
		}
	});
});
