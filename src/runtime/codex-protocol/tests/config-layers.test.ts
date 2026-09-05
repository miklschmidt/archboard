import { expect, test } from "bun:test";

import {
	BrowserUseOriginPolicySchema,
	decodeResponse,
	decodeServerNotification,
	ProtocolDecodeError,
} from "../index.js";
import { responseFixtures } from "./fixtures.js";

function localShellNotification(timeout_ms: number | bigint): unknown {
	return {
		method: "rawResponseItem/completed" as const,
		params: {
			threadId: "thread-1",
			turnId: "turn-1",
			item: {
				type: "local_shell_call",
				call_id: "call-1",
				status: "completed",
				action: {
					type: "exec",
					command: ["true"],
					timeout_ms,
					working_directory: null,
					env: null,
					user: null,
				},
			},
		},
	};
}

test("config/read accepts Codex 0.151.0 omitting enabled-layer disabledReason", () => {
	const configResponse = decodeResponse("config/read", responseFixtures["config/read"]);
	const layer = {
		name: { type: "system", file: "/etc/codex/config.toml" },
		version: "sha256:fixture",
		config: {},
	};
	expect(
		decodeResponse("config/read", {
			...configResponse,
			layers: [{ ...layer, disabledReason: null }],
		}),
	).toMatchObject({ layers: [{ disabledReason: null }] });
	expect(decodeResponse("config/read", { ...configResponse, layers: [layer] })).toMatchObject({
		layers: [layer],
	});
});

test("browser origin policy keeps the generated seven-field shape", () => {
	const policy = {
		access: "allow",
		downloads: "deny",
		uploads: null,
		fullCdpAccess: "allow",
		autoReview: "deny",
		persistentApproval: true,
		accessApprovalLifetime: "thread",
	} as const;
	const decoded = BrowserUseOriginPolicySchema.parse(policy);

	expect(decoded).toEqual(policy);
	expect(Object.keys(decoded)).toEqual([
		"access",
		"downloads",
		"uploads",
		"fullCdpAccess",
		"autoReview",
		"persistentApproval",
		"accessApprovalLifetime",
	]);
});

test("Codex i64 values stay safe JSON numbers and reject bigint", () => {
	const configResponse = decodeResponse("config/read", responseFixtures["config/read"]);
	const safe = decodeResponse("config/read", {
		...configResponse,
		config: { ...configResponse.config, model_context_window: Number.MAX_SAFE_INTEGER },
	});

	expect(Number(safe.config.model_context_window)).toBe(Number.MAX_SAFE_INTEGER);
	expect(() =>
		decodeResponse("config/read", {
			...configResponse,
			config: {
				...configResponse.config,
				model_context_window: Number.MAX_SAFE_INTEGER + 1,
			},
		}),
	).toThrow(ProtocolDecodeError);
	expect(() =>
		decodeResponse("config/read", {
			...configResponse,
			config: { ...configResponse.config, model_context_window: 1n },
		}),
	).toThrow(/bigint; Codex JSON i64 values must be safe numbers/u);
});

test("local shell i64 timeouts use the same safe-number boundary", () => {
	const safe = localShellNotification(Number.MAX_SAFE_INTEGER);

	expect(decodeServerNotification(safe)).toEqual<unknown>(safe);
	expect(() =>
		decodeServerNotification(localShellNotification(Number.MAX_SAFE_INTEGER + 1)),
	).toThrow(ProtocolDecodeError);
	expect(() => decodeServerNotification(localShellNotification(1n))).toThrow(
		/bigint; Codex JSON i64 values must be safe numbers/u,
	);
});
