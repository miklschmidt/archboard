import { describe, expect, test } from "bun:test";

import {
	CurrentTimeReadResponseSchema,
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	LoginAccountParamsSchema,
	LoginPoliciesSchema,
	LOGIN_POLICIES,
	ProtocolErrorSchema,
	SERVER_REQUEST_METHODS,
	SupportedLoginAccountParamsSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../index.js";
import { createIdentityAuthority } from "../../codex-workbench-identity/index.js";
import { createFixtureIds } from "./support.js";

describe("codex browser model", () => {
	test("freezes reviewed initialization, login, time, and error contracts", () => {
		expect(
			InitializeCapabilitiesSchema.parse(JSON.parse(JSON.stringify(INITIALIZE_CAPABILITIES))),
		).toEqual(JSON.parse(JSON.stringify(INITIALIZE_CAPABILITIES)));
		expect(JSON.stringify(INITIALIZE_CAPABILITIES)).toBe(
			'{"experimentalApi":true,"requestAttestation":false,"mcpServerOpenaiFormElicitation":true,"optOutNotificationMethods":[],"extensions":{}}',
		);
		const serializedPolicies = JSON.parse(JSON.stringify(LOGIN_POLICIES));
		expect(LoginPoliciesSchema.parse(serializedPolicies)).toEqual(serializedPolicies);
		expect(LOGIN_POLICIES.map(({ variant, policy }) => `${variant}:${policy}`)).toEqual([
			"apiKey:supported",
			"chatgpt:supported",
			"chatgptDeviceCode:refused",
			"chatgptAuthTokens:refused",
			"amazonBedrock:supported",
			"amazonBedrockAccessKeys:supported",
		]);
		expect(
			LoginPoliciesSchema.safeParse([
				...LOGIN_POLICIES.slice(0, 5),
				{ variant: "amazonBedrock", policy: "supported" },
			]).success,
		).toBeFalse();
		expect(
			LoginPoliciesSchema.safeParse([
				LOGIN_POLICIES[1],
				LOGIN_POLICIES[0],
				...LOGIN_POLICIES.slice(2),
			]).success,
		).toBeFalse();
		expect(ProtocolErrorSchema.parse(UNSUPPORTED_TOKEN_REFRESH_ERROR)).toEqual(
			UNSUPPORTED_TOKEN_REFRESH_ERROR,
		);
		expect(ProtocolErrorSchema.parse(UNSUPPORTED_ATTESTATION_ERROR)).toEqual(
			UNSUPPORTED_ATTESTATION_ERROR,
		);
		expect(CurrentTimeReadResponseSchema.parse({ currentTimeAt: 1_787_682_840 })).toEqual({
			currentTimeAt: 1_787_682_840,
		});
	});

	test("requires authority-issued identities and a current child epoch", () => {
		const ids = createFixtureIds();
		const { model, identity } = ids;
		expect(model.ThreadIdSchema.safeParse("archboard:thread:unissued").success).toBeFalse();
		expect(model.ThreadIdSchema.safeParse(identity.validator.childId).success).toBeFalse();
		expect(
			model.BrowserThreadLinkSchema.safeParse({
				...ids.snapshot.threadLink,
				threadId: "archboard:thread:unissued",
			}).success,
		).toBeFalse();
		const staleEpoch = identity.issuer.mintChildEpoch();
		expect(
			model.BrowserThreadLinkSchema.safeParse({ ...ids.snapshot.threadLink, epoch: staleEpoch })
				.success,
		).toBeFalse();
		const other = createIdentityAuthority();
		expect(() =>
			identity.validator.assertCurrentEpoch(other.validator.childId, identity.validator.epoch),
		).toThrow();
		expect(() =>
			identity.validator.assertCurrentEpoch(identity.validator.childId, staleEpoch),
		).toThrow();
		expect(model.BrowserThreadLinkSchema.parse(ids.snapshot.threadLink)).toEqual(
			ids.snapshot.threadLink,
		);
	});

	test("keeps secrets at the host ingress and out of publishable browser DTOs", () => {
		const ids = createFixtureIds();
		const { model } = ids;
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
		])
			expect(SupportedLoginAccountParamsSchema.safeParse(login).success).toBeTrue();
		expect(
			SupportedLoginAccountParamsSchema.safeParse({ type: "chatgptDeviceCode" }).success,
		).toBeFalse();
		expect(
			LoginAccountParamsSchema.safeParse({
				type: "chatgptAuthTokens",
				accessToken: "secret",
				chatgptAccountId: "account",
			}).success,
		).toBeTrue();
		const ingress = model.BrowserCommandSchema.safeParse({
			...ids.browserCommand,
			command: "accountLogin",
			login: { type: "apiKey", apiKey: "api-secret" },
		});
		expect(ingress.success).toBeTrue();
		expect(
			model.BrowserCommandSchema.safeParse({
				...ids.browserCommand,
				command: "accountLogin",
				login: { type: "chatgptDeviceCode" },
			}).success,
		).toBeFalse();
		expect(
			model.BrowserCommandSchema.safeParse({
				...ids.browserCommand,
				command: "accountLogin",
				login: { type: "chatgptAuthTokens", accessToken: "secret", chatgptAccountId: "account" },
			}).success,
		).toBeFalse();
		const requestId = ids.serverRequests[0]?.id;
		if (requestId === undefined) throw new Error("fixture is missing request identity");
		const approvalResponses = [
			{
				approvalKind: "command_execution",
				decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["bun test"] } },
			},
			{ approvalKind: "file_change", decision: "acceptForSession" },
			{ approvalKind: "user_input", answers: { q: { answers: ["answer"] } } },
			{ approvalKind: "elicitation", action: "accept", content: { answer: "yes" }, _meta: null },
			{
				approvalKind: "permissions",
				permissions: {
					network: { enabled: true },
					fileSystem: { read: ["src"], write: ["out"], entries: [] },
				},
				scope: "session",
				strictAutoReview: true,
			},
			{ approvalKind: "apply_patch", decision: "approved_for_session" },
			{ approvalKind: "exec_command", decision: { denied: { rejection: "no" } } },
		] as const;
		for (const response of approvalResponses) {
			const command = {
				...ids.browserCommand,
				command: "approvalRespond",
				requestId,
				approvalId: null,
				response,
			};
			expect(model.BrowserCommandSchema.safeParse(command as unknown).success).toBeTrue();
			expect(model.BrowserDtoSchema.safeParse(command as unknown).success).toBeFalse();
		}
		expect(
			model.BrowserDtoSchema.safeParse({
				...ids.browserCommand,
				command: "accountLogin",
				login: { type: "apiKey", apiKey: "secret" },
			}).success,
		).toBeFalse();
		expect(JSON.stringify(ids.snapshot)).not.toContain("secret");
	});

	test("round-trips browser families, relational states, and safe results", () => {
		const ids = createFixtureIds();
		const { model } = ids;
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
		].filter((value) => typeof value === "object" && value !== null);
		for (const dto of dtoKinds)
			expect(model.BrowserDtoSchema.parse(JSON.parse(JSON.stringify(dto)))).toEqual(dto);
		expect(ids.snapshot.semantic?.delivery).toBe("outcome_unknown");
		const safeResult = {
			contentItems: [{ type: "inputText", text: "accepted" }],
			success: true,
		};
		const parsedResult = model.BrowserToolResultSchema.safeParse(safeResult as unknown);
		expect(parsedResult.success).toBeTrue();
		if (parsedResult.success)
			expect(JSON.stringify(parsedResult.data)).toBe(JSON.stringify(safeResult));
		expect(
			model.BrowserToolResultSchema.safeParse({
				contentItems: [{ type: "inputImage", imageUrl: "raw" }],
				success: true,
			}).success,
		).toBeFalse();
	});

	test("rejects impossible links, relational contradictions, and unknown browser values", () => {
		const ids = createFixtureIds();
		const { model, identity } = ids;
		expect(
			model.BrowserThreadLinkSchema.safeParse({ ...ids.snapshot.threadLink, state: "unbound" })
				.success,
		).toBeFalse();
		expect(
			model.BrowserThreadLinkSchema.safeParse({ ...ids.snapshot.threadLink, state: "inspect_only" })
				.success,
		).toBeFalse();
		const otherThread = identity.decoder.adoptThreadId("other-thread");
		expect(
			model.BrowserSnapshotSchema.safeParse({
				...ids.snapshot,
				timeline: { ...ids.snapshot.timeline!, threadId: otherThread },
			}).success,
		).toBeFalse();
		expect(
			model.BrowserSnapshotSchema.safeParse({
				...ids.snapshot,
				coordinator: {
					...ids.snapshot.coordinator,
					activeTurnId: identity.decoder.adoptTurnId("missing-turn"),
				},
			}).success,
		).toBeFalse();
		expect(
			model.BrowserDtoSchema.safeParse({ ...ids.snapshot.readiness, state: "future" }).success,
		).toBeFalse();
		expect(
			model.BrowserDtoSchema.safeParse({ ...ids.browserCommand, command: "unknown" }).success,
		).toBeFalse();
	});

	test("covers all eleven requests and exact method-indexed results", () => {
		const ids = createFixtureIds();
		const { model } = ids;
		expect(SERVER_REQUEST_METHODS).toHaveLength(11);
		for (const request of ids.serverRequests)
			expect(model.ServerRequestSchema.parse(JSON.parse(JSON.stringify(request))).method).toBe(
				request.method,
			);
		const firstRequest = ids.serverRequests[0];
		if (!firstRequest) throw new Error("fixture is missing its first request");
		expect(
			model.ServerRequestSchema.safeParse({ ...firstRequest, method: "future/request" }).success,
		).toBeFalse();
		expect(
			model.ServerRequestSchema.safeParse({
				...firstRequest,
				id: "archboard:json-rpc-request:unissued",
			}).success,
		).toBeFalse();
		expect(
			model.ServerRequestSchema.safeParse({
				...firstRequest,
				params: { ...firstRequest.params, extra: true },
			}).success,
		).toBeFalse();
		const methodResults = [
			{ method: "item/commandExecution/requestApproval", result: { decision: "acceptForSession" } },
			{ method: "item/fileChange/requestApproval", result: { decision: "acceptForSession" } },
			{ method: "item/tool/requestUserInput", result: { answers: { q: { answers: ["yes"] } } } },
			{
				method: "mcpServer/elicitation/request",
				result: { action: "accept", content: { answer: "yes" }, _meta: null },
			},
			{
				method: "item/permissions/requestApproval",
				result: { permissions: {}, scope: "session", strictAutoReview: true },
			},
			{
				method: "item/tool/call",
				result: {
					contentItems: [
						{ type: "inputImage", imageUrl: "data" },
						{ type: "inputAudio", audioUrl: "data" },
					],
					success: true,
				},
			},
			{ method: "currentTime/read", result: { currentTimeAt: 1_787_682_840 } },
			{ method: "applyPatchApproval", result: { decision: "approved_for_session" } },
			{ method: "execCommandApproval", result: { decision: { denied: { rejection: "no" } } } },
			{ method: "account/chatgptAuthTokens/refresh", error: UNSUPPORTED_TOKEN_REFRESH_ERROR },
			{ method: "attestation/generate", error: UNSUPPORTED_ATTESTATION_ERROR },
		] as const;
		for (const result of methodResults) {
			const parsed = model.ServerRequestResultSchema.safeParse(result as unknown);
			expect(parsed.success).toBeTrue();
			if (parsed.success) expect(JSON.stringify(parsed.data)).toBe(JSON.stringify(result));
		}
		expect(
			model.ServerRequestResultSchema.safeParse({
				method: "item/tool/call",
				result: { contentItems: [{ type: "future" }], success: true },
			}).success,
		).toBeFalse();
	});

	test("preserves every MCP form member and validates typed defaults and permissions", () => {
		const ids = createFixtureIds();
		const { model } = ids;
		const request = ids.serverRequests[3];
		if (request?.method !== "mcpServer/elicitation/request")
			throw new Error("fixture is missing elicitation request");
		const base = request.params;
		const forms: unknown[] = [
			{
				...base,
				mode: "form",
				requestedSchema: {
					type: "object",
					properties: {
						s: { type: "string", enum: ["r"], default: "r" },
						n: { type: "number", default: 1 },
						b: { type: "boolean", default: true },
					},
				},
			},
			{
				...base,
				mode: "form",
				requestedSchema: {
					type: "object",
					properties: { s: { type: "string", oneOf: [{ const: "r", title: "R" }], default: "r" } },
				},
			},
			{
				...base,
				mode: "form",
				requestedSchema: {
					type: "object",
					properties: { s: { type: "string", enum: ["r"], enumNames: ["R"], default: "r" } },
				},
			},
			{
				...base,
				mode: "form",
				requestedSchema: {
					type: "object",
					properties: {
						s: {
							type: "array",
							items: { type: "string", enum: ["red", "blue"] },
							default: ["red"],
						},
					},
				},
			},
			{
				...base,
				mode: "form",
				requestedSchema: {
					type: "object",
					properties: {
						s: {
							type: "array",
							items: { anyOf: [{ const: "red", title: "Red" }] },
							default: ["red"],
						},
					},
				},
			},
		].map((params) => Object.assign({}, request, { params }));
		for (const form of forms) {
			const parsed = model.ServerRequestSchema.safeParse(form as unknown);
			expect(parsed.success).toBeTrue();
			if (parsed.success) expect(parsed.data).toEqual(JSON.parse(JSON.stringify(form)));
		}
		expect(
			model.ServerRequestSchema.safeParse({
				...request,
				params: {
					...base,
					mode: "form",
					requestedSchema: {
						type: "object",
						properties: { s: { type: "string", enum: ["r"], default: "bad" } },
					},
				},
			}).success,
		).toBeFalse();
		expect(
			model.ServerRequestSchema.safeParse({
				...request,
				params: {
					...base,
					mode: "form",
					requestedSchema: {
						type: "object",
						properties: { b: { type: "boolean", default: "bad" } },
					},
				},
			}).success,
		).toBeFalse();
		expect(
			model.ServerRequestSchema.safeParse({
				...request,
				params: {
					...base,
					mode: "form",
					requestedSchema: {
						type: "object",
						properties: {
							s: {
								type: "array",
								items: { type: "string", enum: ["red", "blue"] },
								default: ["bad"],
							},
						},
					},
				},
			}).success,
		).toBeFalse();
		const permissions = ids.serverRequests[0];
		if (permissions?.method !== "item/commandExecution/requestApproval")
			throw new Error("fixture is missing command request");
		const validPermissions = {
			...permissions,
			params: {
				...permissions.params,
				additionalPermissions: {
					network: null,
					fileSystem: { read: ["src"], write: ["out"], entries: [] },
				},
			},
		};
		const parsedPermissions = model.ServerRequestSchema.safeParse(validPermissions);
		expect(parsedPermissions.success).toBeTrue();
		if (parsedPermissions.success) expect(parsedPermissions.data).toEqual(validPermissions);
		expect(
			model.ServerRequestSchema.safeParse({
				...permissions,
				params: {
					...permissions.params,
					additionalPermissions: { network: null, fileSystem: { read: [{}], write: null } },
				},
			}).success,
		).toBeFalse();
	});
});
