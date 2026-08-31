import { describe, expect, test } from "bun:test";

import { restoreIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { type SessionCurrentTimeRequest } from "../index.js";
import { createSessionFixture, reverseRequest } from "./support.js";
import { createTransportSessionFixture } from "./transport-chain-support.js";

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected currentTime/read to reject");
}

describe("Codex session current-time reverse request", () => {
	test("resolves an issued raw wire ThreadId through transport and answers every frame once", async () => {
		const fixture = createTransportSessionFixture(() => 12_345);
		try {
			const issued = fixture.identity.decoder.adoptThreadId("thread-current");
			fixture.send({
				id: "current",
				method: "currentTime/read",
				params: { threadId: "thread-current" },
			});
			await fixture.settle();
			expect(fixture.identity.decoder.resolveThreadId("thread-current")).toBe(issued);
			expect(fixture.frames()).toEqual([{ id: "current", result: { currentTimeAt: 12 } }]);
			expect(fixture.transport.inspectIssues()).toEqual([]);

			const otherEpoch = fixture.identity.issuer.mintChildEpoch();
			const staleAuthority = restoreIdentityAuthority({
				childId: fixture.identity.validator.childId,
				epoch: otherEpoch,
			});
			staleAuthority.decoder.adoptThreadId("stale-thread");
			const wrongDomain = fixture.identity.decoder.adoptTurnId("wrong-domain");
			const invalid = [
				["unissued", "unissued-thread"],
				["wrong-domain", wrongDomain],
				["stale-epoch", "stale-thread"],
				["invalid", ""],
			] as const;
			for (const [id, threadId] of invalid) {
				fixture.send({ id, method: "currentTime/read", params: { threadId } });
				await fixture.settle();
			}

			const frames = fixture.frames();
			for (const [id] of invalid) {
				expect(frames.filter((frame) => frame.id === id)).toEqual([
					{
						id,
						error: { code: -32602, message: "Reverse request params were invalid." },
					},
				]);
			}
		} finally {
			await fixture.close();
		}
	});

	test("requires an issued current ThreadId and never sends an invalid response shape", async () => {
		const fixture = createSessionFixture({ now: () => 12_345 });
		try {
			await fixture.session.initialize();
			const issuedThreadId = fixture.identity.decoder.adoptThreadId("thread-current");
			const valid = reverseRequest(fixture, "currentTime/read", {
				threadId: issuedThreadId,
			}) as SessionCurrentTimeRequest;
			fixture.transport.emitServerRequest(valid);
			await flush();
			expect(fixture.transport.reverseResponses).toHaveLength(1);
			expect(fixture.transport.reverseResponses[0]?.response).toEqual({
				result: { currentTimeAt: 12 },
			});

			const invalid = [
				reverseRequest(fixture, "currentTime/read", {
					threadId: "raw-thread-id",
				}) as SessionCurrentTimeRequest,
				reverseRequest(fixture, "currentTime/read", {
					threadId: "archboard:thread:unissued",
				}) as SessionCurrentTimeRequest,
				reverseRequest(fixture, "currentTime/read", {
					threadId: fixture.identity.decoder.adoptTurnId("wrong-domain"),
				}) as SessionCurrentTimeRequest,
			];
			const staleEpoch = fixture.identity.issuer.mintChildEpoch();
			const staleBase = reverseRequest(fixture, "currentTime/read", {
				threadId: issuedThreadId,
			}) as SessionCurrentTimeRequest;
			invalid.push({
				...staleBase,
				epoch: staleEpoch,
				correlation: { ...staleBase.correlation, epoch: staleEpoch },
			});

			for (const request of invalid) {
				const error = await rejected(fixture.session.respondCurrentTime(request));
				expect(error).toMatchObject({ code: "invalid_identity" });
				fixture.transport.emitServerRequest(request);
			}
			await flush();
			expect(fixture.transport.reverseResponses).toHaveLength(1 + invalid.length);
			expect(fixture.transport.reverseResponses.slice(1).map(({ response }) => response)).toEqual(
				invalid.map(() => ({
					error: {
						code: -32602,
						message: "The reverse request is not valid for the current Codex child epoch.",
					},
				})),
			);
		} finally {
			fixture.close();
		}
	});
});
