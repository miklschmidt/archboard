import { describe, expect, test } from "bun:test";

import {
	BedrockSetupParamsSchema,
	CLIENT_REQUEST_METHODS,
	CLIENT_REQUEST_METHODS_WITHOUT_PARAMS,
	CLIENT_REQUEST_PARAM_SCHEMAS,
	decodeClientRequestParams,
	ProtocolDecodeError,
	RESPONSE_METHODS,
	type ClientRequestParams,
} from "../index.js";
import {
	BEDROCK_SETUP_FIXTURES,
	COMPLETE_CLIENT_REQUEST_FIXTURES,
	LOGIN_ACCOUNT_FIXTURES,
} from "./client-request-fixtures.js";

function captured(run: () => unknown): ProtocolDecodeError {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(ProtocolDecodeError);
		return error as ProtocolDecodeError;
	}
	throw new Error("Expected request params to be refused");
}

describe("Codex generated client request params", () => {
	test("keeps the generated no-parameter request shape exact", () => {
		type Exact<Actual, Expected> = [Actual, Expected] extends [Expected, Actual] ? true : false;
		const configRequirementsParams: Exact<
			ClientRequestParams<"configRequirements/read">,
			undefined
		> = true;
		const accountLogoutParams: Exact<ClientRequestParams<"account/logout">, undefined> = true;

		expect(CLIENT_REQUEST_METHODS_WITHOUT_PARAMS).toEqual([
			"configRequirements/read",
			"account/logout",
		]);
		expect(configRequirementsParams).toBeTrue();
		expect(accountLogoutParams).toBeTrue();
		expect(decodeClientRequestParams("configRequirements/read", undefined)).toBeUndefined();
		expect(decodeClientRequestParams("account/logout", undefined)).toBeUndefined();
		captured(() => decodeClientRequestParams("configRequirements/read", {}));
		captured(() => decodeClientRequestParams("account/logout", {}));
	});

	test("owns every supported outbound method in one exact registry", () => {
		expect(CLIENT_REQUEST_METHODS).toHaveLength(32);
		expect(Object.keys(CLIENT_REQUEST_PARAM_SCHEMAS)).toEqual([...CLIENT_REQUEST_METHODS]);
		expect([...CLIENT_REQUEST_METHODS]).toEqual(
			RESPONSE_METHODS.filter((method) => method !== "currentTime/read"),
		);
		expect(Object.keys(COMPLETE_CLIENT_REQUEST_FIXTURES)).toEqual([...CLIENT_REQUEST_METHODS]);
	});

	test("decodes a complete fixture for every supported outbound method", () => {
		for (const method of CLIENT_REQUEST_METHODS) {
			const fixture = COMPLETE_CLIENT_REQUEST_FIXTURES[method];
			expect(decodeClientRequestParams(method, fixture)).toEqual(fixture);
		}
	});

	test("keeps large finite numbers inside generated JsonValue fields", () => {
		const params = {
			threadId: "thread-1",
			items: [{ magnitude: 1.5e20 }],
		};

		expect(decodeClientRequestParams("thread/inject_items", params)).toEqual(params);
	});

	test("owns generated initialize ingress beside the authored protocol policy", async () => {
		const publicProtocol = await import("../index.js");
		const generatedParams = {
			clientInfo: { name: "archboard", title: null, version: "1" },
			capabilities: null,
		};
		expect(publicProtocol).not.toHaveProperty("decodeInitializeParams");
		expect(publicProtocol).not.toHaveProperty("InitializeParamsSchema");
		const authoredCapabilities = {
			experimentalApi: true as const,
			requestAttestation: false as const,
			mcpServerOpenaiFormElicitation: true as const,
			optOutNotificationMethods: [] as [],
			extensions: {},
		};
		expect(publicProtocol.InitializeCapabilitiesSchema.parse(authoredCapabilities)).toEqual(
			authoredCapabilities,
		);
		expect(publicProtocol.INITIALIZE_CAPABILITIES).toEqual(authoredCapabilities);
		expect(decodeClientRequestParams("initialize", generatedParams)).toEqual(generatedParams);
	});

	test("keeps all generated login and refused Bedrock setup variants typed", () => {
		for (const fixture of LOGIN_ACCOUNT_FIXTURES)
			expect(decodeClientRequestParams("account/login/start", fixture)).toEqual(fixture);
		for (const fixture of BEDROCK_SETUP_FIXTURES)
			expect(BedrockSetupParamsSchema.parse(fixture)).toEqual(fixture);
	});

	test("rejects missing required request fields at the method boundary", () => {
		const steerError = captured(() =>
			decodeClientRequestParams("turn/steer", {
				threadId: "thread-1",
				input: [],
			}),
		);
		expect(steerError.method).toBe("turn/steer");
		expect(steerError.direction).toBe("client-request");
		expect(steerError.issues).toEqual(
			expect.arrayContaining([expect.objectContaining({ path: ["expectedTurnId"] })]),
		);

		const realtimeError = captured(() =>
			decodeClientRequestParams("thread/realtime/start", { threadId: "thread-1" }),
		);
		expect(realtimeError.issues).toEqual(
			expect.arrayContaining([expect.objectContaining({ path: ["outputModality"] })]),
		);
	});

	test("rejects extra request fields", () => {
		const configError = captured(() =>
			decodeClientRequestParams("config/read", {
				includeLayers: true,
				unexpected: true,
			}),
		);
		expect(configError.issues).toEqual(
			expect.arrayContaining([expect.objectContaining({ path: [] })]),
		);

		captured(() =>
			decodeClientRequestParams("turn/steer", {
				threadId: "thread-1",
				clientUserMessageId: "message-1",
				input: [],
				additionalContext: {},
				expectedTurnId: "turn-1",
				futureField: true,
			}),
		);
		captured(() =>
			decodeClientRequestParams("turn/start", {
				threadId: "thread-1",
				input: [{ type: "text", text: "hello", text_elements: [], unexpected: true }],
			}),
		);
	});

	test("rejects malformed records and arrays", () => {
		captured(() => decodeClientRequestParams("thread/read", "thread-1"));
		captured(() =>
			decodeClientRequestParams("thread/queue/reorder", {
				threadId: "thread-1",
				queuedSubmissionIds: "queue-1",
			}),
		);
		captured(() =>
			decodeClientRequestParams("thread/start", {
				dynamicTools: [
					{
						type: "function",
						name: "bad",
						description: "bad",
						inputSchema: () => undefined,
					},
				],
			}),
		);
		captured(() =>
			decodeClientRequestParams("thread/start", {
				config: { invalidJsonValue: undefined },
			}),
		);
		captured(() =>
			decodeClientRequestParams("turn/start", {
				threadId: "thread-1",
				input: [],
				responsesapiClientMetadata: { invalidString: undefined },
			}),
		);
	});

	test("rejects values outside generated closed unions", () => {
		captured(() => decodeClientRequestParams("thread/list", { sourceKinds: ["future-client"] }));
		captured(() =>
			decodeClientRequestParams("thread/realtime/start", {
				threadId: "thread-1",
				outputModality: "audio",
				voice: "future-voice",
			}),
		);
		captured(() =>
			decodeClientRequestParams("turn/start", {
				threadId: "thread-1",
				input: [{ type: "future-input" }],
			}),
		);
		expect(
			BedrockSetupParamsSchema.safeParse({ type: "role", region: "eu-west-1" }).success,
		).toBeFalse();
	});
});
