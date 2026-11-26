import { z } from "zod";
import {
	CodexSettingsReplySchema,
	type CodexSettingsLoginRequest,
	type CodexSettingsReply,
	type CodexSettingsSaveRequest,
} from "#shared/codex-settings/schemas/codex-settings.ts";

const CodexSettingsFailureReplySchema = z.object({
	success: z.literal(false),
	code: z.string(),
	error: z.string(),
});

type CodexSettingsFailureReply = z.infer<typeof CodexSettingsFailureReplySchema>;
type CodexSettingsOutcome = CodexSettingsReply | CodexSettingsFailureReply;

/**
 * Turn an unparseable or network-level failure into a structured failure reply.
 * @param error Optional thrown error.
 * @returns Failure reply.
 */
function invalidReply(error?: unknown): CodexSettingsFailureReply {
	return {
		success: false,
		code: "REQUEST_FAILED",
		error:
			error instanceof Error && error.message.length > 0
				? error.message
				: "Could not reach the Archboard server for Codex settings.",
	};
}

/**
 * Build fetch RequestInit options from optional method, JSON payload, and abort signal.
 * @param init Request parameters.
 * @param init.method HTTP method.
 * @param init.payload Optional JSON payload.
 * @param init.signal Optional abort signal.
 * @returns Fetch init object.
 */
function buildFetchInit(
	init: {
		readonly method?: "GET" | "POST" | "PUT" | "DELETE";
		readonly payload?: unknown;
		readonly signal?: AbortSignal | undefined;
	} = {},
): RequestInit {
	const result: RequestInit = {};
	if (init.method !== undefined) result.method = init.method;
	if (init.payload !== undefined) {
		result.headers = { "Content-Type": "application/json" };
		result.body = JSON.stringify(init.payload);
	}
	if (init.signal !== undefined) result.signal = init.signal;
	return result;
}

/**
 * Send one Codex settings HTTP request and validate the JSON response against the closed schemas.
 * @param url Endpoint path.
 * @param init Optional HTTP method, payload, and abort signal.
 * @param init.method HTTP method.
 * @param init.payload Optional JSON request payload.
 * @param init.signal Optional abort signal.
 * @returns Parsed success or failure reply.
 */
async function requestCodexSettings(
	url: string,
	init?: {
		readonly method?: "GET" | "POST" | "PUT" | "DELETE";
		readonly payload?: unknown;
		readonly signal?: AbortSignal | undefined;
	},
): Promise<CodexSettingsOutcome> {
	try {
		const response = await fetch(url, buildFetchInit(init));
		const body: unknown = await response.json();
		const parsed = response.ok
			? CodexSettingsReplySchema.safeParse(body)
			: CodexSettingsFailureReplySchema.safeParse(body);
		return parsed.success ? parsed.data : invalidReply();
	} catch (error) {
		return invalidReply(error);
	}
}

/**
 * Fetch current Codex auth status, available models (when signed in), and saved model settings.
 * @param signal Optional cancellation signal.
 * @returns Settings reply or failure reply.
 */
function fetchCodexSettings(signal?: AbortSignal): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex", { signal });
}

/**
 * Persist chosen orchestrator and workhorse models, reasoning efforts, and service tiers.
 * @param payload Orchestrator and workhorse selections.
 * @returns Updated settings reply or failure reply.
 */
function saveCodexSettings(payload: CodexSettingsSaveRequest): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex", { method: "PUT", payload });
}

/**
 * Reset saved Codex model preferences back to defaults.
 * @returns Updated settings reply or failure reply.
 */
function resetCodexSettings(): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex", { method: "DELETE" });
}

/**
 * Start a Codex sign-in (ChatGPT OAuth or OpenAI API key).
 * @param payload Sign-in method and credentials.
 * @returns Updated settings reply or failure reply.
 */
function startCodexLogin(payload: CodexSettingsLoginRequest): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex/login", { method: "POST", payload });
}

/**
 * Cancel a pending Codex sign-in.
 * @param loginId Pending sign-in id.
 * @returns Updated settings reply or failure reply.
 */
function cancelCodexLogin(loginId: string): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex/login/cancel", {
		method: "POST",
		payload: { loginId },
	});
}

/**
 * Sign out of Codex in the running app-server.
 * @returns Updated settings reply or failure reply.
 */
function logoutCodex(): Promise<CodexSettingsOutcome> {
	return requestCodexSettings("/api/settings/codex/logout", { method: "POST" });
}

export {
	cancelCodexLogin,
	fetchCodexSettings,
	logoutCodex,
	resetCodexSettings,
	saveCodexSettings,
	startCodexLogin,
	type CodexSettingsFailureReply,
	type CodexSettingsOutcome,
};
