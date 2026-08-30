import { describe, expect, test } from "bun:test";

import {
	BrowserDtoSchema,
	BrowserSnapshotSchema,
	BrowserThreadLinkSchema,
	BrowserToolResultSchema,
	CurrentTimeReadResponseSchema,
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	LoginAccountParamsSchema,
	LoginPoliciesSchema,
	LOGIN_POLICIES,
	ProtocolErrorSchema,
	SERVER_REQUEST_METHODS,
	ServerRequestSchema,
	ServerRequestResultSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../index.js";
import { createFixtureIds } from "./support.js";

describe("codex browser model", () => {
	test("freezes the reviewed initialize and login contracts", () => {
		expect(
			InitializeCapabilitiesSchema.parse(JSON.parse(JSON.stringify(INITIALIZE_CAPABILITIES))),
		).toEqual(JSON.parse(JSON.stringify(INITIALIZE_CAPABILITIES)));
		expect(JSON.stringify(INITIALIZE_CAPABILITIES)).toBe(
			'{"experimentalApi":true,"requestAttestation":false,"mcpServerOpenaiFormElicitation":true,"optOutNotificationMethods":[],"extensions":{}}',
		);
		expect(LOGIN_POLICIES).toHaveLength(6);
		expect(LoginPoliciesSchema.parse(JSON.parse(JSON.stringify(LOGIN_POLICIES)))).toEqual(
			JSON.parse(JSON.stringify(LOGIN_POLICIES)),
		);
		expect(LOGIN_POLICIES.map(({ variant, policy }) => `${variant}:${policy}`)).toEqual([
			"apiKey:supported",
			"chatgpt:supported",
			"chatgptDeviceCode:refused",
			"chatgptAuthTokens:refused",
			"amazonBedrock:supported",
			"amazonBedrockAccessKeys:supported",
		]);
		expect(ProtocolErrorSchema.parse(UNSUPPORTED_TOKEN_REFRESH_ERROR)).toEqual(
			UNSUPPORTED_TOKEN_REFRESH_ERROR,
		);
		expect(ProtocolErrorSchema.parse(UNSUPPORTED_ATTESTATION_ERROR)).toEqual(
			UNSUPPORTED_ATTESTATION_ERROR,
		);
	});

	test("accepts supported host login credentials but never models them in snapshots", () => {
		for (const login of [
			{ type: "apiKey", apiKey: "api-secret" },
			{ type: "chatgpt" },
			{ type: "amazonBedrock", apiKey: "bedrock-secret", region: "us-east-1" },
			{
				type: "amazonBedrockAccessKeys",
				accessKeyId: "access-key",
				secretAccessKey: "secret-key",
				region: "us-east-1",
			},
		]) {
			expect(LoginAccountParamsSchema.safeParse(login).success).toBeTrue();
		}
		const ids = createFixtureIds();
		const snapshot = ids.snapshot;
		expect(JSON.stringify(snapshot)).not.toContain("secret");
		expect(
			BrowserSnapshotSchema.safeParse({
				...snapshot,
				account: { kind: "account", state: "ready", accountType: "chatgpt", apiKey: "secret" },
			}).success,
		).toBeFalse();
	});

	test("round-trips every browser DTO family and preserves delivery uncertainty", () => {
		const ids = createFixtureIds();
		const dtoKinds = [
			ids.snapshot,
			ids.snapshot.readiness,
			ids.snapshot.account,
			ids.snapshot.login,
			ids.snapshot.threadLink,
			ids.snapshot.timeline,
			ids.snapshot.queue,
			ids.snapshot.settings[0],
			ids.snapshot.approvals[0],
			ids.textCommand,
			ids.snapshot.semantic,
			ids.snapshot.coordinator,
			ids.snapshot.voice,
			ids.snapshot.lease,
			ids.snapshot.operation,
			ids.browserCommand,
		].filter((value) => typeof value === "object" && value !== null);
		for (const dto of dtoKinds)
			expect(BrowserDtoSchema.parse(JSON.parse(JSON.stringify(dto)))).toEqual(dto);
		expect(ids.snapshot.semantic?.delivery).toBe("outcome_unknown");
	});

	test("rejects unknown browser identities, states, capabilities, commands, and result media", () => {
		const ids = createFixtureIds();
		const result: {
			contentItems: [{ type: "inputText"; text: string }];
			success: boolean;
		} = {
			contentItems: [{ type: "inputText", text: "accepted" }],
			success: true,
		};
		expect(BrowserToolResultSchema.parse(result)).toEqual(result);
		expect(ServerRequestResultSchema.parse(result)).toEqual(result);
		expect(
			BrowserThreadLinkSchema.safeParse({ ...ids.snapshot.threadLink, threadId: "thread-raw" })
				.success,
		).toBeFalse();
		expect(
			BrowserDtoSchema.safeParse({ ...ids.snapshot.readiness, state: "future" }).success,
		).toBeFalse();
		expect(
			BrowserDtoSchema.safeParse({ ...ids.browserCommand, command: "unknown" }).success,
		).toBeFalse();
		expect(
			BrowserDtoSchema.safeParse({ ...ids.snapshot.login, state: "future" }).success,
		).toBeFalse();
		expect(LoginAccountParamsSchema.safeParse({ type: "futureLogin" }).success).toBeFalse();
		expect(
			InitializeCapabilitiesSchema.safeParse({ ...INITIALIZE_CAPABILITIES, experimentalApi: false })
				.success,
		).toBeFalse();
		expect(
			BrowserToolResultSchema.safeParse({
				contentItems: [{ type: "image", data: "secret" }],
				success: true,
			}).success,
		).toBeFalse();
		expect(
			ServerRequestResultSchema.safeParse({
				contentItems: [{ type: "image", data: "secret" }],
				success: true,
			}).success,
		).toBeFalse();
	});

	test("covers exactly the eleven 0.151.0 server request methods", () => {
		const ids = createFixtureIds();
		expect(SERVER_REQUEST_METHODS).toHaveLength(11);
		for (const request of ids.serverRequests) {
			const decoded = ServerRequestSchema.parse(JSON.parse(JSON.stringify(request)));
			expect(decoded.method).toBe(request.method);
		}
		const firstRequest = ids.serverRequests.at(0);
		if (!firstRequest) throw new Error("fixture is missing its first server request");
		expect(
			ServerRequestSchema.safeParse({ ...firstRequest, method: "future/request" }).success,
		).toBeFalse();
		expect(
			ServerRequestSchema.safeParse({ ...firstRequest, id: "json-rpc-request-raw" }).success,
		).toBeFalse();
		expect(
			ServerRequestSchema.safeParse({
				...firstRequest,
				params: { ...firstRequest.params, extra: true },
			}).success,
		).toBeFalse();
	});

	test("keeps the exact current-time and unsupported-request policy visible", () => {
		expect(CurrentTimeReadResponseSchema.parse({ currentTimeAt: 1_787_682_840 })).toEqual({
			currentTimeAt: 1_787_682_840,
		});
		expect(CurrentTimeReadResponseSchema.safeParse({ currentTimeAt: 1.5 }).success).toBeFalse();
		expect(UNSUPPORTED_TOKEN_REFRESH_ERROR.code).toBe(-32601);
		expect(UNSUPPORTED_ATTESTATION_ERROR.code).toBe(-32601);
	});
});
