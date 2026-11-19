import { describe, expect, test } from "bun:test";

import { CodexTransportRequestError } from "#runtime/transport/clients/transport-errors.ts";
import {
	captureRejection,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	sendJson,
} from "#tests/runtime/support/transport-fake-child.ts";

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

describe("Codex app-server reverse-request rule precedence", () => {
	test("answers a frame that breaks several rules by the first rule it breaks", async () => {
		const { child, transport, close } = createHarness();
		try {
			sendJson(child, { id: "r1", method: "future/request", extra: true });
			sendJson(child, { id: "r2", method: 3, extra: true });
			sendJson(child, { id: "r1", method: 3 });
			await flushStreams();

			expect(
				transport.inspectIssues().map((issue) => [issue.kind, issue.detail, issue.requestId]),
			).toEqual([
				["malformed-frame", "A reverse request has invalid envelope fields", "r1"],
				["malformed-frame", "A reverse request method is missing or invalid", "r2"],
				["duplicate-server-request", "A reverse request id was already used", "r1"],
			]);
			expect(frames(child)).toEqual([
				{ id: "r1", error: { code: -32_600, message: "Invalid reverse request." } },
				{ id: "r2", error: { code: -32_600, message: "Invalid reverse request." } },
			]);
		} finally {
			await close();
		}
	});
});
