import { expect, test } from "bun:test";

import { BrowserUseOriginPolicySchema, decodeResponse, ProtocolDecodeError } from "../index.js";
import { responseFixtures } from "./fixtures.js";

test("config/read requires the generated disabledReason field", () => {
	const configResponse = responseFixtures["config/read"] as {
		readonly config: Record<string, unknown>;
		readonly origins: Record<string, unknown>;
		readonly layers: null;
	};
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
	expect(() => decodeResponse("config/read", { ...configResponse, layers: [layer] })).toThrow(
		ProtocolDecodeError,
	);
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
	const configResponse = responseFixtures["config/read"] as {
		readonly config: Record<string, unknown>;
		readonly origins: Record<string, unknown>;
		readonly layers: null;
	};
	const safe = decodeResponse("config/read", {
		...configResponse,
		config: { ...configResponse.config, model_context_window: Number.MAX_SAFE_INTEGER },
	});

	expect(safe.config.model_context_window).toBe(Number.MAX_SAFE_INTEGER);
	expect(() =>
		decodeResponse("config/read", {
			...configResponse,
			config: {
				...configResponse.config,
				model_context_window: Number.MAX_SAFE_INTEGER + 1,
			},
		}),
	).toThrow(/outside the safe JSON integer range/);
	expect(() =>
		decodeResponse("config/read", {
			...configResponse,
			config: { ...configResponse.config, model_context_window: 1n },
		}),
	).toThrow(/bigint; Codex JSON i64 values must be safe numbers/);
});
