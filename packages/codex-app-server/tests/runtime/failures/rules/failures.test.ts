import { describe, expect, test } from "bun:test";

import {
	createCodexFailure,
	readCodexFailure,
	type CodexFailureSpec,
} from "#runtime/failures/rules/failures.ts";
import { CodexProcessError } from "#runtime/processes/process-contract.ts";
import { CodexExecutableError } from "#runtime/services/executable.ts";
import { CodexSessionMutationError } from "#runtime/session/services/session-api.ts";
import {
	CodexTransportOwnershipError,
	CodexTransportRemoteError,
	CodexTransportUsageError,
} from "#runtime/transport/clients/transport-errors.ts";
import { createIdentityAuthority } from "#shared/rules/workbench-identity.ts";

const SPECS: readonly CodexFailureSpec[] = [
	{ kind: "mutation", method: "turn/start", outcome: "not_delivered", message: "never sent" },
	{ kind: "mutation", method: "turn/steer", outcome: "outcome_unknown", message: "may have run" },
	{ kind: "process", code: "spawn_failed", terminal: true, message: "could not spawn" },
	{ kind: "refused_write", message: "Invalid Codex transport operation: bad params" },
	{ kind: "remote", method: "account/read", code: -32_600, message: "account/read was refused" },
];

describe("createCodexFailure and readCodexFailure", () => {
	test("read back exactly the failure that was made", () => {
		for (const spec of SPECS) {
			expect(readCodexFailure(createCodexFailure(spec))).toEqual(spec);
		}
	});

	test("make the error Codex throws, with the spec's message", () => {
		const names = SPECS.map((spec) => {
			const error = createCodexFailure(spec);
			expect(error.message).toBe(spec.message);
			return error.name;
		});
		expect(names).toEqual([
			"CodexSessionMutationError",
			"CodexSessionMutationError",
			"CodexProcessError",
			"CodexTransportUsageError",
			"CodexTransportRemoteError",
		]);
	});

	test("read every error the package throws by what callers ask of it", () => {
		const identity = (() => {
			try {
				createIdentityAuthority().decoder.parseThreadId("not issued");
			} catch (error) {
				return error;
			}
			throw new Error("an unissued thread parsed");
		})();
		const authority = createIdentityAuthority();
		const correlation = authority.decoder.createWireRequestCorrelation({
			requestId: authority.issuer.mintJsonRpcRequestId(),
		});
		const cases: readonly (readonly [unknown, object | null])[] = [
			[
				new CodexSessionMutationError("thread/start", "outcome_unknown", "lost"),
				{ kind: "mutation", method: "thread/start", outcome: "outcome_unknown", message: "lost" },
			],
			[
				new CodexTransportUsageError("bad params"),
				{ kind: "refused_write", message: "Invalid Codex transport operation: bad params" },
			],
			[
				new CodexTransportOwnershipError("not yours"),
				{ kind: "refused_write", message: "Codex reverse-request ownership error: not yours" },
			],
			[
				new CodexTransportRemoteError({
					method: "account/read",
					correlation,
					rpcError: { code: -32_600, message: "no" },
				}),
				{
					kind: "remote",
					method: "account/read",
					code: -32_600,
					message: "Codex request account/read returned JSON-RPC error -32600: no",
				},
			],
			[
				new CodexProcessError({ code: "crash", terminal: false, message: "crashed" }),
				{ kind: "process", code: "crash", terminal: false, message: "crashed" },
			],
			[
				new CodexExecutableError({ code: "missing", executablePath: "/x", message: "gone" }),
				{ kind: "executable", code: "missing", message: "gone" },
			],
			[identity, { kind: "identity", code: "invalid-shape" }],
			[new Error("plain"), null],
			["not an error", null],
			[{ outcome: "not_delivered" }, null],
		];
		for (const [error, expected] of cases) {
			if (expected === null) expect(readCodexFailure(error)).toBeNull();
			else expect(readCodexFailure(error)).toMatchObject(expected);
		}
	});

	test("keep the cause a mutation failure was made with", () => {
		const cause = new Error("underneath");
		expect(createCodexFailure(SPECS[0]!, cause).cause).toBe(cause);
	});

	test("read only the value itself, never what it was caused by", () => {
		const inner = createCodexFailure(SPECS[0]!);
		expect(readCodexFailure(new Error("outer", { cause: inner }))).toBeNull();
		expect(readCodexFailure(new AggregateError([inner], "both"))).toBeNull();
	});
});
