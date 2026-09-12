// Activating a code target: the person asks for the code a board subject is
// bound to, and the server opens it. The board and the subject's stable
// identity go to the server, which owns the binding, the opener and the
// checkout registry; the browser never reads a local path.

import type {
	CodeTargetNotice,
	CodeTargetOpenFailure,
	CodeTargetOpenSuccess,
} from "@/shared/code-target";
import {
	fetchOpenerSettings,
	openCodeTarget,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
} from "@/ui/code-target/api";

/** What an activation needs. */
interface CodeTargetActivationOptions {
	/** The board key the subject is on, or null when the pane is on no board. */
	boardKey: string | null;
	/** The stable semantic id whose binding to open. */
	elementId: string;
	onSuccess: (reply: CodeTargetOpenSuccess) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

/**
 * The notice for a typed failure.
 * @param reply The failure.
 * @returns The notice, with the failure's actions.
 */
function failureNotice(reply: CodeTargetOpenFailure): CodeTargetNotice {
	return { kind: "error", message: reply.error, actions: reply.actions ?? [] };
}

/**
 * Open a board subject's code target, reporting the typed outcome.
 * @param options The board, the subject and where outcomes go.
 */
function activateCodeTarget(options: CodeTargetActivationOptions): void {
	const { boardKey, elementId, onSuccess, onFailure } = options;
	if (boardKey === null || boardKey === "") {
		onFailure({
			kind: "error",
			message: "No board is available for this code target.",
			actions: [],
		});
		return;
	}
	void openCodeTarget({ board: boardKey, element: elementId }).then((reply) => {
		if (reply.success) {
			onSuccess(reply);
		} else {
			onFailure(failureNotice(reply));
		}
		return reply;
	});
}

export {
	activateCodeTarget,
	fetchOpenerSettings,
	openCodeTarget,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
	type CodeTargetActivationOptions,
};
