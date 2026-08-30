import { describe, expect, test } from "bun:test";

import {
	IdentityValidationError,
	createIdentityAuthority,
	createLogicalToolCallCorrelation,
	createWireRequestCorrelation,
	mintChildEpoch,
	parseBrowserCommandId,
	parseChildEpoch,
	parseChildId,
	parseIdentityDomain,
	parseThreadId,
	parseWireRequestCorrelation,
	restoreIdentityAuthority,
} from "../index.ts";
import type { WireRequestCorrelation } from "../index.ts";

function errorCode(action: () => unknown): string {
	try {
		action();
	} catch (error) {
		if (error instanceof IdentityValidationError) return error.code;
		throw error;
	}
	throw new Error("expected the action to fail");
}

describe("codex workbench identities", () => {
	test("mints distinct domain-tagged identities and preserves them through JSON", () => {
		const authority = createIdentityAuthority();
		const values = [
			authority.childId,
			authority.epoch,
			authority.mintBrowserCommandId(),
			authority.adoptThreadId("thread-from-codex"),
			authority.adoptTurnId("turn-from-codex"),
			authority.adoptItemId("item-from-codex"),
			authority.adoptQueuedSubmissionId("queue-from-codex"),
			authority.adoptLoginId("login-from-codex"),
			authority.mintJsonRpcRequestId(),
			authority.mintDynamicToolCallId(),
			authority.mintRealtimeSessionId(),
			authority.mintApprovalId(),
		];
		expect(new Set(values).size).toBe(values.length);
		for (const value of values) expect(JSON.parse(JSON.stringify(value))).toBe(value);
		expect(parseChildId(authority.childId)).toBe(authority.childId);
		expect(parseChildEpoch(authority.epoch, authority.childId)).toBe(authority.epoch);
		expect(authority.parseBrowserCommandId(authority.mintBrowserCommandId())).toBeString();
		expect(authority.parseThreadId(authority.adoptThreadId("another-thread"))).toBeString();
	});

	test("rejects empty, malformed, and wrong-domain wire strings", () => {
		const authority = createIdentityAuthority();
		expect(errorCode(() => parseChildId(""))).toBe("empty");
		expect(errorCode(() => parseChildId("child:made-up"))).toBe("invalid-shape");
		expect(errorCode(() => parseChildId(authority.epoch))).toBe("wrong-domain");
		expect(errorCode(() => parseBrowserCommandId(authority.childId))).toBe("wrong-domain");
		expect(errorCode(() => parseThreadId("archboard:thread:"))).toBe("invalid-shape");
		expect(errorCode(() => parseIdentityDomain("archboard:future-domain:value"))).toBe(
			"wrong-domain",
		);
		expect(
			errorCode(() => parseChildEpoch(authority.epoch, parseChildId("archboard:child:other"))),
		).toBe("wrong-child");
	});

	test("authority rejects caller-fabricated identities and adopts server values once", () => {
		const authority = createIdentityAuthority();
		const requestId = authority.mintJsonRpcRequestId();
		const forgedRequest = `archboard:json-rpc-request:${requestId.slice(-8)}`;
		expect(errorCode(() => authority.parseJsonRpcRequestId(forgedRequest))).toBe("unissued");
		const thread = authority.adoptThreadId("server-thread");
		expect(authority.parseThreadId(thread)).toBe(thread);
		expect(authority.adoptThreadId("server-thread")).toBe(thread);
		expect(errorCode(() => authority.parseThreadId("archboard:thread:other-thread"))).toBe(
			"unissued",
		);
	});

	test("wire request correlation is closed and current-epoch bound", () => {
		const authority = createIdentityAuthority();
		const requestId = authority.mintJsonRpcRequestId();
		const correlation = createWireRequestCorrelation(authority, { requestId });
		expect(Object.keys(correlation)).toEqual(["child", "epoch", "requestId"]);
		expect(parseWireRequestCorrelation(authority, JSON.parse(JSON.stringify(correlation)))).toEqual(
			correlation,
		);
		expect(
			errorCode(() =>
				parseWireRequestCorrelation(authority, { ...correlation, requestId: authority.childId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() => parseWireRequestCorrelation(authority, { ...correlation, extra: true })),
		).toBe("extra-field");
		const replacement = createIdentityAuthority();
		expect(errorCode(() => parseWireRequestCorrelation(replacement, correlation))).toBe(
			"wrong-child",
		);
		const sameChildNewEpoch = restoreIdentityAuthority({
			childId: authority.childId,
			epoch: mintChildEpoch(authority.childId),
		});
		expect(errorCode(() => parseWireRequestCorrelation(sameChildNewEpoch, correlation))).toBe(
			"stale-epoch",
		);
	});

	test("logical tool-call correlation is closed, typed, and current-epoch bound", () => {
		const authority = createIdentityAuthority();
		const input = {
			threadId: authority.adoptThreadId("thread-1"),
			turnId: authority.adoptTurnId("turn-1"),
			callId: authority.mintDynamicToolCallId(),
			namespace: "archboard_app",
			tool: "inspect_workhorse",
			manifestHash: "a".repeat(64),
		};
		const correlation = createLogicalToolCallCorrelation(authority, input);
		expect(Object.keys(correlation)).toEqual([
			"child",
			"epoch",
			"threadId",
			"turnId",
			"callId",
			"namespace",
			"tool",
			"manifestHash",
		]);
		expect(
			authority.parseLogicalToolCallCorrelation(JSON.parse(JSON.stringify(correlation))),
		).toEqual(correlation);
		expect(
			errorCode(() =>
				authority.parseLogicalToolCallCorrelation({ ...correlation, turnId: input.threadId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() =>
				authority.parseLogicalToolCallCorrelation({ ...correlation, epoch: authority.childId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() => authority.parseLogicalToolCallCorrelation({ ...correlation, namespace: "" })),
		).toBe("invalid-field");
	});

	test("restores persisted child and epoch without changing their wire identity", () => {
		const original = createIdentityAuthority();
		const restored = restoreForTest(original.childId, original.epoch);
		expect(restored.childId).toBe(original.childId);
		expect(restored.epoch).toBe(original.epoch);
		expect(errorCode(() => restored.parseJsonRpcRequestId(original.mintJsonRpcRequestId()))).toBe(
			"unissued",
		);
	});
});

function restoreForTest(
	childId: WireRequestCorrelation["child"],
	epoch: WireRequestCorrelation["epoch"],
): ReturnType<typeof createIdentityAuthority> {
	// Keep this helper's arguments branded to prove persisted values retain their
	// domain while crossing the JSON fixture boundary below.
	const value = JSON.parse(JSON.stringify({ childId, epoch })) as {
		childId: unknown;
		epoch: unknown;
	};
	return restoreIdentityAuthority(value);
}
