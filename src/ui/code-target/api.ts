// The code-target and opener endpoints, as the browser calls them.
//
// Every one of these replies is parsed strictly against the shared schema in
// `@/shared/code-target`, which is the contract both sides hold: this is the
// one surface where the browser asks the machine to run something, so a reply
// it did not understand is a refusal rather than a guess.

import {
	CodeTargetOpenFailureSchema,
	CodeTargetOpenSuccessSchema,
	OpenerSelectionReplySchema,
	OpenerSettingsReplySchema,
	OpenerTestReplySchema,
	type CodeTargetOpenFailure,
	type CodeTargetOpenReply,
	type CodeTargetOpenRequest,
	type OpenerSelection,
	type OpenerSelectionReply,
	type OpenerSettingsReply,
	type OpenerTestReply,
} from "@/shared/code-target";
import { mutation, strictReply, type ReplySchema } from "@/ui/server-requests";

/**
 * The failure reported when the server's reply matches no schema.
 * @param error What went wrong reading it, when known.
 * @returns A `RESPONSE_INVALID` failure.
 */
function invalidReply(error?: unknown): CodeTargetOpenFailure {
	const detail = error instanceof Error ? ` ${error.message}` : "";
	return {
		success: false,
		code: "RESPONSE_INVALID",
		error: `RESPONSE_INVALID: The canvas server returned an invalid reply.${detail}`,
	};
}

/**
 * A code-target or opener reply, parsed strictly against its schema.
 * @param url The endpoint.
 * @param init Request options.
 * @param successSchema What a 2xx body must satisfy.
 * @returns The parsed success, or the shared failure.
 */
function codeTargetReply<T>(
	url: string,
	init: RequestInit | undefined,
	successSchema: ReplySchema<T>,
): Promise<T | CodeTargetOpenFailure> {
	return strictReply(url, init, successSchema, CodeTargetOpenFailureSchema, invalidReply);
}

/**
 * Ask the server to open the code a board subject is bound to.
 * @param request The board and the subject.
 * @returns The typed success or failure.
 */
function openCodeTarget(request: CodeTargetOpenRequest): Promise<CodeTargetOpenReply> {
	return codeTargetReply(
		"/api/code-targets/open",
		mutation("POST", request),
		CodeTargetOpenSuccessSchema,
	);
}

/**
 * Read the opener settings and the registered checkouts.
 * @returns The settings reply, or the shared failure.
 */
function fetchOpenerSettings(): Promise<OpenerSettingsReply | CodeTargetOpenFailure> {
	return codeTargetReply("/api/settings/opener", undefined, OpenerSettingsReplySchema);
}

/**
 * Persist an opener selection.
 * @param selection The selection to save.
 * @returns The saved selection, or the shared failure.
 */
function saveOpenerSettings(
	selection: OpenerSelection,
): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
	return codeTargetReply(
		"/api/settings/opener",
		mutation("PUT", selection),
		OpenerSelectionReplySchema,
	);
}

/**
 * Restore the platform default opener.
 * @returns The restored selection, or the shared failure.
 */
function resetOpenerSettings(): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
	return codeTargetReply("/api/settings/opener", { method: "DELETE" }, OpenerSelectionReplySchema);
}

/**
 * Launch a selection against a registered checkout without saving it.
 * @param selection The selection under test.
 * @param repository The registered checkout to open.
 * @returns The test outcome, or the shared failure.
 */
function testOpenerSettings(
	selection: OpenerSelection,
	repository: string,
): Promise<OpenerTestReply | CodeTargetOpenFailure> {
	return codeTargetReply(
		"/api/settings/opener/test",
		mutation("POST", { selection, repository }),
		OpenerTestReplySchema,
	);
}

export {
	fetchOpenerSettings,
	openCodeTarget,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
};
