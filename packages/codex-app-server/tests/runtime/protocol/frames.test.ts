import { describe, expect, test } from "bun:test";

import { decodeFrame, decodeFrameBody, encodeFrame } from "#runtime/protocol/frames.ts";
import { ProtocolDecodeError } from "#runtime/protocol/protocol-decoder.ts";
import { frameOf } from "#tests/runtime/support/frame-decoding.ts";
import { serverRequestFixtures } from "#tests/runtime/support/protocol-fixtures.ts";

describe("decodeFrame classifies a line by its envelope alone", () => {
	test("refuses a line that is not one strict JSON object", () => {
		expect(decodeFrame(Buffer.alloc(0))).toEqual({ kind: "empty" });
		expect(decodeFrame(Buffer.from("{nope"))).toEqual({ kind: "malformed" });
		expect(decodeFrame(Buffer.from([0x7b, 0xff, 0x7d]))).toEqual({ kind: "malformed" });
		expect(decodeFrame(Buffer.from("[1]"))).toEqual({ kind: "not-object" });
	});

	test("keeps the top-level id and method of a frame that repeats a key", () => {
		expect(decodeFrame(Buffer.from('{"id":7,"method":"x","a":1,"a":2}'))).toEqual({
			kind: "duplicate-key",
			id: 7,
			key: "number:7",
			methodPresent: true,
		});
		expect(decodeFrame(Buffer.from('{"id":null,"r":1,"r":2}'))).toEqual({
			kind: "duplicate-key",
			methodPresent: false,
		});
	});

	test("tells requests, notifications, responses and bare ids apart", () => {
		expect(frameOf({ id: "a", method: "currentTime/read", params: {} })).toMatchObject({
			kind: "request",
			id: "a",
			key: "string:a",
		});
		expect(frameOf({ method: "thread/started", params: {} })).toMatchObject({
			kind: "notification",
		});
		expect(frameOf({ id: 1, result: {} })).toMatchObject({ kind: "response", outcome: "result" });
		expect(frameOf({ id: 1, error: {} })).toMatchObject({ kind: "response", outcome: "error" });
		expect(frameOf({ id: 1, result: {}, error: {} })).toMatchObject({
			kind: "response",
			outcome: "malformed",
		});
		expect(frameOf({ id: null, result: {} })).not.toHaveProperty("id");
		expect(frameOf({ id: 1 })).toEqual({ kind: "bare-id", id: 1, key: "number:1" });
		expect(frameOf({ id: 1.5 })).toEqual({ kind: "unknown" });
		expect(frameOf({ result: {} })).toEqual({ kind: "unknown" });
	});

	test("names the first envelope rule a request breaks", () => {
		expect(frameOf({ id: 1, method: 3, extra: true })).toMatchObject({ problem: "method-invalid" });
		expect(frameOf({ id: 1, method: "future/request", extra: true })).toMatchObject({
			problem: "envelope-fields",
		});
		expect(frameOf({ id: 1, method: "future/request" })).toMatchObject({
			problem: "unsupported-method",
		});
		expect(frameOf({ id: 1, method: "currentTime/read" })).toMatchObject({
			problem: "no-params",
		});
		expect(frameOf({ id: 1, method: "currentTime/read", params: {} })).not.toHaveProperty(
			"problem",
		);
	});
});

describe("decodeFrameBody decodes what a frame carries", () => {
	test("decodes a response by the method of the request it answers", () => {
		const frame = frameOf({ id: 7, result: { turnId: "turn-1" } });
		if (frame.kind !== "response") throw new Error("expected a response");
		expect(decodeFrameBody(frame, "turn/steer")).toEqual({
			ok: true,
			value: { outcome: "result", result: { turnId: "turn-1" } },
		});
		const refused = decodeFrameBody(frame, "thread/list");
		expect(refused.ok).toBeFalse();
		expect(refused.ok ? undefined : refused.error).toBeInstanceOf(ProtocolDecodeError);
	});

	test("refuses a response that carries both outcomes", () => {
		const frame = frameOf({ id: 7, result: {}, error: { code: 1, message: "m" } });
		if (frame.kind !== "response") throw new Error("expected a response");
		expect(decodeFrameBody(frame, "turn/steer").ok).toBeFalse();
	});

	test("keeps a request of a disabled capability decodable by its params alone", () => {
		const params = serverRequestFixtures["attestation/generate"];
		const frame = frameOf({ id: 2, method: "attestation/generate", params });
		if (frame.kind !== "request") throw new Error("expected a request");
		expect(decodeFrameBody(frame)).toEqual<unknown>({
			ok: true,
			value: { id: 2, method: "attestation/generate", params },
		});
	});
});

/**
 * Encodes a request with a fixed id and a generous bound.
 * @param method The request method.
 * @param params The params.
 * @returns The encoder's answer.
 */
function request(method: string, params: unknown): unknown {
	return encodeFrame({ kind: "request", allocateId: () => 1, method, params }, 1024);
}

describe("encodeFrame writes one line within its bound", () => {
	test("writes a request with the key of its id, omitting params for a method that takes none", () => {
		const encoded = encodeFrame(
			{ kind: "request", allocateId: () => "r1", method: "account/logout", params: undefined },
			1024,
		);
		expect(encoded).toEqual({
			ok: true,
			line: Buffer.from('{"id":"r1","method":"account/logout"}\n'),
			key: "string:r1",
		});
	});

	test("refuses a method or params before it encodes", () => {
		expect(request("future/request", 1n)).toEqual({ ok: false, reason: "unsupported-method" });
		expect(request("account/logout", {})).toEqual({ ok: false, reason: "params-present" });
		expect(request("turn/steer", "text")).toEqual({ ok: false, reason: "params-not-object" });
		expect(request("turn/steer", { big: 1n })).toEqual({ ok: false, reason: "unencodable" });
		expect(encodeFrame({ kind: "notification", method: "future" }, 1024)).toEqual({
			ok: false,
			reason: "unsupported-method",
		});
	});

	test("refuses a line over its bound, not counting the newline", () => {
		const frame = { kind: "error", id: 1, code: "overloaded", message: "m" } as const;
		const line = '{"id":1,"error":{"code":-32001,"message":"m"}}';
		expect(encodeFrame(frame, line.length)).toEqual({
			ok: true,
			line: Buffer.from(`${line}\n`),
			key: "number:1",
		});
		expect(encodeFrame(frame, line.length - 1)).toEqual({ ok: false, reason: "too-large" });
	});
});
