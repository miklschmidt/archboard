import type { DynamicServerRequest } from "../../codex-transport/server-requests.js";
import type { DynamicToolResponse } from "../index.js";

function copyRequest(request: DynamicServerRequest): DynamicServerRequest {
	return {
		...request,
		params: { ...request.params },
	};
}

function responseValue(response: DynamicToolResponse): unknown {
	const text = response.contentItems[0]?.text;
	if (text === undefined) {
		throw new Error("response has no inputText item");
	}
	return JSON.parse(text) as unknown;
}

function responseEnvelope(response: DynamicToolResponse): Record<string, unknown> {
	const value = responseValue(response);
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("response envelope is not an object");
	}
	return value as Record<string, unknown>;
}

function nextMicrotasks(): Promise<void> {
	return Promise.resolve().then(() => undefined);
}

export { copyRequest, responseValue, responseEnvelope, nextMicrotasks };
