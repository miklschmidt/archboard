import { describe, expect, test } from "bun:test";

import {
	IdentityValidationError,
	OPERATION_ID_MAX_BYTES,
	createIdentityAuthorities,
	createIdentityAuthority,
	restoreIdentityAuthorities,
	restoreIdentityAuthority,
} from "../index.ts";
import type { CodexIdentity, WireRequestCorrelation } from "../index.ts";
import { withOperationNonceSequence } from "./support.ts";

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
	test("separates ordinary validation, host issuance, and trusted decoding", () => {
		const authority = createIdentityAuthority();
		const { validator, issuer, decoder } = authority;
		const browserCommand = issuer.mintBrowserCommandId();
		const hostRequest = issuer.mintJsonRpcRequestId();
		const realtime = issuer.mintRealtimeSessionId();
		const threadId = decoder.adoptThreadId("thread-from-codex");
		const serverIds = [
			threadId,
			decoder.adoptTurnId("turn-from-codex"),
			decoder.adoptItemId("item-from-codex"),
			decoder.adoptQueuedSubmissionId("queue-from-codex"),
			decoder.adoptLoginId("login-from-codex"),
			decoder.adoptJsonRpcRequestId("reverse-request-from-codex"),
			decoder.adoptDynamicToolCallId("call-from-codex"),
			decoder.adoptApprovalId("approval-from-codex"),
		];
		const values = [
			validator.childId,
			validator.epoch,
			browserCommand,
			hostRequest,
			realtime,
			...serverIds,
		];
		expect(new Set(values).size).toBe(values.length);
		for (const value of values) expect(JSON.parse(JSON.stringify(value))).toBe(value);
		expect(decoder.parseBrowserCommandId(browserCommand)).toBe(browserCommand);
		expect(decoder.parseThreadId(threadId)).toBe(threadId);
		expect(validator.isCurrentEpoch(validator.childId, validator.epoch)).toBeTrue();
		expect(decoder.parseChildId(validator.childId)).toBe(validator.childId);
		expect(decoder.parseChildEpoch(validator.epoch)).toBe(validator.epoch);
	});

	test("keeps ordinary identity facades physically separate from operation authority", () => {
		const ordinary = createIdentityAuthority();

		expect(Object.keys(ordinary)).toEqual(["validator", "issuer", "decoder"]);
		expect(Reflect.ownKeys(ordinary)).toEqual(["validator", "issuer", "decoder"]);
		expect("operation" in ordinary).toBeFalse();
		expect(Reflect.get(ordinary, "operation")).toBeUndefined();

		for (const capability of [ordinary.validator, ordinary.issuer, ordinary.decoder]) {
			expect(Reflect.get(capability, "mintOperationId")).toBeUndefined();
			expect(Reflect.get(capability, "parseOperationId")).toBeUndefined();
			expect(Reflect.get(capability, "serializeOperationId")).toBeUndefined();
		}
	});

	test("restores the test entropy seam topology after success and failure", () => {
		const beforeSuccess = {
			own: Object.hasOwn(crypto, "randomUUID"),
			descriptor: Object.getOwnPropertyDescriptor(crypto, "randomUUID"),
			value: Reflect.get(crypto, "randomUUID"),
		};
		withOperationNonceSequence(["a".repeat(32)], (authorities) => {
			authorities.operation.issuer.mintOperationId();
		});
		expect(Object.hasOwn(crypto, "randomUUID")).toBe(beforeSuccess.own);
		expect(Object.getOwnPropertyDescriptor(crypto, "randomUUID")).toEqual(beforeSuccess.descriptor);
		expect(Reflect.get(crypto, "randomUUID")).toBe(beforeSuccess.value);

		const beforeFailure = {
			own: Object.hasOwn(crypto, "randomUUID"),
			descriptor: Object.getOwnPropertyDescriptor(crypto, "randomUUID"),
			value: Reflect.get(crypto, "randomUUID"),
		};
		expect(() =>
			withOperationNonceSequence(["b".repeat(32)], () => {
				throw new Error("test seam failure");
			}),
		).toThrow("test seam failure");
		expect(Object.hasOwn(crypto, "randomUUID")).toBe(beforeFailure.own);
		expect(Object.getOwnPropertyDescriptor(crypto, "randomUUID")).toEqual(beforeFailure.descriptor);
		expect(Reflect.get(crypto, "randomUUID")).toBe(beforeFailure.value);
	});

	test("issues unique epoch-bound operation IDs within the authored result bound", () => {
		const authorities = createIdentityAuthorities();
		const { identity, operation } = authorities;
		const { issuer, validator } = identity;
		const operationIds = Array.from({ length: 64 }, () => operation.issuer.mintOperationId());
		const firstOperationId = operationIds[0]!;
		const epochToken = validator.epoch.slice("archboard:epoch:".length);
		expect(new Set(operationIds).size).toBe(operationIds.length);
		for (const operationId of operationIds) {
			expect(operationId).toMatch(
				new RegExp(`^archboard:operation:${epochToken}\\.h[0-9a-f]{32}$`, "u"),
			);
			expect(new TextEncoder().encode(operationId).byteLength).toBeLessThanOrEqual(
				OPERATION_ID_MAX_BYTES,
			);
			expect(operation.decoder.serializeOperationId(operationId)).toBe(operationId);
			expect(operation.decoder.parseOperationId(JSON.parse(JSON.stringify(operationId)))).toBe(
				operationId,
			);
			expect(operation.validator.isCurrentOperationId(operationId)).toBeTrue();
			operation.validator.assertCurrentOperationId(operationId);
		}

		const fabricated = `archboard:operation:${epochToken}.h${"a".repeat(32)}`;
		const unissued = restoreIdentityAuthorities({
			childId: validator.childId,
			epoch: validator.epoch,
		});
		const nextEpoch = issuer.mintChildEpoch();
		const stale = restoreIdentityAuthorities({ childId: validator.childId, epoch: nextEpoch });
		const otherChild = createIdentityAuthorities();
		expect(errorCode(() => operation.decoder.parseOperationId(""))).toBe("empty");
		expect(
			errorCode(() => operation.decoder.parseOperationId("archboard:operation:malformed")),
		).toBe("invalid-shape");
		expect(errorCode(() => operation.decoder.parseOperationId(validator.childId))).toBe(
			"wrong-domain",
		);
		expect(errorCode(() => operation.decoder.parseOperationId(fabricated))).toBe("unissued");
		expect(errorCode(() => unissued.operation.decoder.parseOperationId(firstOperationId))).toBe(
			"unissued",
		);
		expect(errorCode(() => stale.operation.decoder.parseOperationId(firstOperationId))).toBe(
			"stale-epoch",
		);
		expect(errorCode(() => otherChild.operation.decoder.parseOperationId(firstOperationId))).toBe(
			"wrong-child",
		);
		expect(stale.operation.validator.isCurrentOperationId(firstOperationId)).toBeFalse();

		const oversizedChildToken = "c".repeat(90);
		const oversized = restoreIdentityAuthorities({
			childId: `archboard:child:${oversizedChildToken}`,
			epoch: `archboard:epoch:${oversizedChildToken}.h${"a".repeat(32)}`,
		});
		expect(errorCode(() => oversized.operation.issuer.mintOperationId())).toBe("invalid-shape");
	});

	test("retries a duplicate nonce once and accepts the next unique nonce", () => {
		const duplicate = "a".repeat(32);
		const fresh = "b".repeat(32);
		withOperationNonceSequence([duplicate, duplicate, fresh], (authorities) => {
			const first = authorities.operation.issuer.mintOperationId();
			const second = authorities.operation.issuer.mintOperationId();

			expect(first).toContain(`.h${duplicate}`);
			expect(second).toContain(`.h${fresh}`);
		});
	});

	test("fails predictably after the canonical duplicate retry budget", () => {
		const duplicate = "c".repeat(32);
		withOperationNonceSequence([duplicate], (authorities, attempts) => {
			authorities.operation.issuer.mintOperationId();
			expect(errorCode(() => authorities.operation.issuer.mintOperationId())).toBe(
				"issuance-exhausted",
			);
			expect(attempts()).toBe(17);
		});
	});

	test("trusted adoption preserves raw Codex values through the authority serializer", () => {
		const { issuer, decoder } = createIdentityAuthority();
		const rawValues = [
			"thread/from-codex/α",
			"turn from codex",
			"item:with:punctuation",
			"queue\nfrom\tcodex",
			"login-from-codex",
			"reverse-request-from-codex",
			"dynamic-call-from-codex",
			"approval-from-codex",
		];
		const threadId = decoder.adoptThreadId(rawValues[0]!);
		const adopted = [
			threadId,
			decoder.adoptTurnId(rawValues[1]!),
			decoder.adoptItemId(rawValues[2]!),
			decoder.adoptQueuedSubmissionId(rawValues[3]!),
			decoder.adoptLoginId(rawValues[4]!),
			decoder.adoptJsonRpcRequestId(rawValues[5]!),
			decoder.adoptDynamicToolCallId(rawValues[6]!),
			decoder.adoptApprovalId(rawValues[7]!),
		];
		for (const [index, identity] of adopted.entries()) {
			const raw = rawValues[index]!;
			expect(decoder.serializeCodexIdentity(identity)).toBe(raw);
			expect(new TextEncoder().encode(decoder.serializeCodexIdentity(identity))).toEqual(
				new TextEncoder().encode(raw),
			);
		}
		const hostRequest = issuer.mintJsonRpcRequestId();
		expect(decoder.serializeCodexIdentity(hostRequest)).toMatch(/^[a-f0-9]{32}$/);
		expect(decoder.adoptThreadId(rawValues[0]!)).toBe(threadId);
	});

	test("rejects lone UTF-16 surrogates before encoding and preserves valid Unicode", () => {
		const { decoder } = createIdentityAuthority();
		expect(errorCode(() => decoder.adoptThreadId("\ud800"))).toBe("invalid-shape");
		expect(errorCode(() => decoder.adoptThreadId("\udfff"))).toBe("invalid-shape");
		const replacement = "\ufffd";
		const musicalSymbol = "\ud834\udd1e";
		const replacementId = decoder.adoptThreadId(replacement);
		const musicalSymbolId = decoder.adoptThreadId(musicalSymbol);
		expect(replacementId).not.toBe(musicalSymbolId);
		expect(decoder.serializeCodexIdentity(replacementId)).toBe(replacement);
		expect(decoder.serializeCodexIdentity(musicalSymbolId)).toBe(musicalSymbol);
		expect(new TextEncoder().encode(decoder.serializeCodexIdentity(musicalSymbolId))).toEqual(
			new TextEncoder().encode(musicalSymbol),
		);
	});

	test("adopts response identities atomically and preserves duplicate identity equality", () => {
		const { decoder } = createIdentityAuthority();
		expect(() =>
			decoder.adoptCodexResponseIdentities({
				threadIds: ["valid-before-failure", ""],
				turnIds: ["turn-before-failure"],
			}),
		).toThrow(IdentityValidationError);
		expect(errorCode(() => decoder.resolveThreadId("valid-before-failure"))).toBe("unissued");

		const adopted = decoder.adoptCodexResponseIdentities({
			threadIds: ["same-thread", "same-thread"],
			turnIds: ["same-turn", "same-turn"],
			itemIds: ["same-item", "same-item"],
			queuedSubmissionIds: ["same-queue", "same-queue"],
			loginIds: ["same-login", "same-login"],
		});
		for (const values of Object.values(adopted)) expect(values[0]).toBe(values[1]);
	});

	test("rejects empty, malformed, and caller-fabricated identities", () => {
		const authority = createIdentityAuthority();
		const { decoder, validator } = authority;
		expect(errorCode(() => decoder.parseThreadId(""))).toBe("empty");
		expect(errorCode(() => decoder.parseThreadId("thread:made-up"))).toBe("invalid-shape");
		expect(errorCode(() => decoder.parseThreadId(validator.childId))).toBe("wrong-domain");
		expect(errorCode(() => decoder.parseBrowserCommandId(validator.childId))).toBe("wrong-domain");
		expect(errorCode(() => decoder.parseThreadId("archboard:thread:sfake"))).toBe("unissued");
		expect(errorCode(() => decoder.adoptThreadId(""))).toBe("empty");
		expect(errorCode(() => decoder.adoptThreadId("bad\0identity"))).toBe("invalid-shape");
		expect(
			errorCode(() =>
				decoder.serializeCodexIdentity(validator.childId as unknown as CodexIdentity),
			),
		).toBe("wrong-domain");
	});

	test("wire request correlation is closed and current-epoch bound", () => {
		const authority = createIdentityAuthority();
		const { validator, issuer, decoder } = authority;
		const requestId = issuer.mintJsonRpcRequestId();
		const correlation = decoder.createWireRequestCorrelation({ requestId });
		expect(Object.keys(correlation)).toEqual(["child", "epoch", "requestId"]);
		expect(decoder.parseWireRequestCorrelation(JSON.parse(JSON.stringify(correlation)))).toEqual(
			correlation,
		);
		expect(
			errorCode(() =>
				decoder.parseWireRequestCorrelation({ ...correlation, requestId: validator.childId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() => decoder.parseWireRequestCorrelation({ ...correlation, extra: true })),
		).toBe("extra-field");
		const replacement = createIdentityAuthority();
		expect(errorCode(() => replacement.decoder.parseWireRequestCorrelation(correlation))).toBe(
			"wrong-child",
		);
		const sameChildNewEpoch = restoreIdentityAuthority({
			childId: validator.childId,
			epoch: issuer.mintChildEpoch(),
		});
		expect(
			errorCode(() => sameChildNewEpoch.decoder.parseWireRequestCorrelation(correlation)),
		).toBe("stale-epoch");
	});

	test("logical tool-call correlation is closed, typed, and current-epoch bound", () => {
		const authority = createIdentityAuthority();
		const { decoder, validator } = authority;
		const correlation = decoder.createLogicalToolCallCorrelation({
			threadId: decoder.adoptThreadId("thread-1"),
			turnId: decoder.adoptTurnId("turn-1"),
			callId: decoder.adoptDynamicToolCallId("call-1"),
			namespace: "archboard_app",
			tool: "inspect_workhorse",
			manifestHash: "a".repeat(64),
		});
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
			decoder.parseLogicalToolCallCorrelation(JSON.parse(JSON.stringify(correlation))),
		).toEqual(correlation);
		expect(
			errorCode(() =>
				decoder.parseLogicalToolCallCorrelation({ ...correlation, turnId: correlation.threadId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() =>
				decoder.parseLogicalToolCallCorrelation({ ...correlation, epoch: validator.childId }),
			),
		).toBe("wrong-domain");
		expect(
			errorCode(() => decoder.parseLogicalToolCallCorrelation({ ...correlation, namespace: "" })),
		).toBe("invalid-field");
	});

	test("restores persisted child and epoch without changing their identity", () => {
		const original = createIdentityAuthority();
		const restored = restoreForTest(original.validator.childId, original.validator.epoch);
		expect(restored.validator.childId).toBe(original.validator.childId);
		expect(restored.validator.epoch).toBe(original.validator.epoch);
		expect(
			errorCode(() =>
				restored.decoder.parseJsonRpcRequestId(original.issuer.mintJsonRpcRequestId()),
			),
		).toBe("unissued");
	});
});

function restoreForTest(
	childId: WireRequestCorrelation["child"],
	epoch: WireRequestCorrelation["epoch"],
): ReturnType<typeof createIdentityAuthority> {
	const value = JSON.parse(JSON.stringify({ childId, epoch })) as {
		childId: unknown;
		epoch: unknown;
	};
	return restoreIdentityAuthority(value);
}
