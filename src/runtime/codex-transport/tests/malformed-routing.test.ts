import { describe, expect, test } from "bun:test";

import { CodexTransportRequestError } from "../errors.js";
import {
	captureRejection,
	closeTransport,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	sendJson,
} from "./fake-child.js";

describe("Codex app-server malformed routing contract", () => {
	test("settles a pending id-only frame before reverse-request fallback", async () => {
		const { child, transport } = createHarness();
		try {
			const pending = transport.request("turn/steer", {});
			const id = frameAt(child, 0).id;
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
			expect(
				frames(child).some(
					(frame) =>
						frame.id === id && (frame.error as { code?: unknown } | undefined)?.code === -32600,
				),
			).toBeFalse();

			const recovered = transport.request("turn/steer", {});
			const recoveredId = frameAt(child, 1).id;
			sendJson(child, { id: recoveredId, result: { turnId: "recovered" } });
			expect((await recovered).result).toEqual({ turnId: "recovered" });
		} finally {
			await closeTransport(transport, child);
		}
	});
});
