// The code-target and opener endpoints, as the browser calls them.
//
// Every one of these replies is parsed strictly against the shared schema in
// this package's `shared/schemas/`, which is the contract both sides hold: this is the
// one surface where the browser asks the machine to run something, so a reply
// it did not understand is a refusal rather than a guess.

import {
	CodeTargetOpenFailureSchema,
	CodeTargetOpenSuccessSchema,
	type CodeTargetOpenFailure,
	type CodeTargetOpenReply,
	type CodeTargetOpenRequest,
} from "#shared/schemas/code-target-open.ts";
import {
	OpenerSelectionReplySchema,
	OpenerSettingsReplySchema,
	OpenerTestReplySchema,
	type OpenerSelection,
	type OpenerSelectionReply,
	type OpenerSettingsReply,
	type OpenerTestReply,
} from "#shared/schemas/opener-settings.ts";
import { strictReply, type ReplySchema } from "@archboard/server-requests";

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
		error: `RESPONSE_INVALID: The Archboard server returned an invalid reply.${detail}`,
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
	init: Parameters<typeof strictReply>[1],
	successSchema: ReplySchema<T>,
): Promise<T | CodeTargetOpenFailure> {
	return strictReply(url, init, successSchema, CodeTargetOpenFailureSchema, invalidReply);
}

/**
 * Ask the server to open the code a board subject is bound to.
 * @param vault The vault of the pane the subject is in.
 * @param request The board and the subject.
 * @returns The typed success or failure.
 */
function openCodeTarget(
	vault: string,
	request: CodeTargetOpenRequest,
): Promise<CodeTargetOpenReply> {
	// The route takes no query, so the vault rides in the body (ADR 0049).
	return codeTargetReply(
		"/api/code-targets/open",
		{ method: "POST", payload: { ...request, vault } },
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
		{ method: "PUT", payload: selection },
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
		{ method: "POST", payload: { selection, repository } },
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
