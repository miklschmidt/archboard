import type { DeliveryOutcome } from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchComposerDraftDisposition } from "../contract.js";

/**
 * What happens to the text a person typed, per settled outcome. This is the
 * whole policy, in one place, because getting it wrong either loses somebody's
 * words or sends them twice.
 *
 * - `delivered`: cleared. The host published an authoritative turn carrying the
 *   message, so keeping the text would invite a duplicate turn.
 * - `not_delivered`: restored into the live composer. Nothing reached the
 *   workhorse, so resending is safe and is the obvious next action. The submit
 *   path signals this by throwing `MessageNotSentError` from the runtime's
 *   `onNew`, which is what puts the text back in the composer's own buffer.
 * - `outcome_unknown`: retained, but never restored into the live composer and
 *   never resubmitted. Archboard does not retry an unknown mutation (ADR 0019
 *   and the workbench delivery contract), and this composer holds no setter for
 *   the reviewed primitive's text buffer, so the retained copy is presented as
 *   inert text the person can read and copy after they have looked at the
 *   workhorse timeline. Silently clearing it would lose the words; silently
 *   restoring it would make one keystroke send a second turn whose predecessor
 *   may already be running.
 */
export function composerDraftDisposition(
	outcome: DeliveryOutcome,
): WorkbenchComposerDraftDisposition {
	switch (outcome) {
		case "delivered":
			return "cleared";
		case "not_delivered":
			return "restored";
		case "outcome_unknown":
			return "retained";
	}
}
