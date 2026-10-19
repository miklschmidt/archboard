// Activating a code target: the person asks for the code a board subject is
// bound to, and the server opens it. The board and the subject's stable
// identity go to the server, which owns the binding, the opener and the
// checkout registry; the browser never reads a local path.

import type {
	CodeTargetNotice,
	CodeTargetOpenFailure,
	CodeTargetOpenSuccess,
} from "@archboard/code-binding/opening";
import { openCodeTarget } from "#ui/clients/code-target-requests.ts";

/** What an activation needs. */
interface CodeTargetActivationOptions {
	/** The vault of the pane the subject is in. */
	vault: string;
	/** The board key the subject is on, or null when the pane is on no board. */
	boardKey: string | null;
	/** The stable semantic id whose binding to open. */
	elementId: string;
	onSuccess: (reply: CodeTargetOpenSuccess) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

/**
 * The notice for a typed failure. A checkout on another ref than the binding names is not an
 * error: the code is there, at the bound ref, behind the action the notice offers.
 * @param reply The failure.
 * @returns The notice, with the failure's actions.
 */
function failureNotice(reply: CodeTargetOpenFailure): CodeTargetNotice {
	return {
		kind: reply.code === "CHECKOUT_ON_OTHER_REF" ? "info" : "error",
		message: reply.error,
		actions: reply.actions ?? [],
	};
}

/**
 * What the person is told about a successful open: nothing, unless the checkout's version was
 * opened although the binding names another branch or commit.
 * @param reply The success.
 * @returns The notice, or null when the editor showing the code says it all.
 */
function openedNotice(reply: CodeTargetOpenSuccess): CodeTargetNotice | null {
	if (reply.otherRef === undefined) {
		return null;
	}
	return {
		kind: "info",
		message: `Opened ${reply.path} as it is on ${reply.otherRef.checkedOut}. The binding names ${reply.otherRef.named}.`,
		actions: [],
	};
}

/**
 * Open a board subject's code target, reporting the typed outcome.
 * @param options The board, the subject and where outcomes go.
 */
function activateCodeTarget(options: CodeTargetActivationOptions): void {
	const { vault, boardKey, elementId, onSuccess, onFailure } = options;
	if (boardKey === null || boardKey === "") {
		onFailure({
			kind: "error",
			message: "No board is available for this code target.",
			actions: [],
		});
		return;
	}
	void openCodeTarget(vault, { board: boardKey, element: elementId }).then((reply) => {
		if (reply.success) {
			onSuccess(reply);
		} else {
			onFailure(failureNotice(reply));
		}
		return reply;
	});
}

export { activateCodeTarget, openedNotice, type CodeTargetActivationOptions };
