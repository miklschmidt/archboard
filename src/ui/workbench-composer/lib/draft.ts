import type { DeliveryOutcome } from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchComposerDraftDisposition } from "../contract.js";

/**
 * What happens to the text a person typed, per settled outcome. This is the
 * whole policy, in one place, because getting it wrong either loses somebody's
 * words or sends them twice.
 *
 * - `delivered`: cleared. The host published an authoritative turn carrying the
 *   message, so keeping the text would invite a duplicate turn.
 * - `not_delivered`: left in the live composer. Nothing reached the workhorse,
 *   so resending is safe and is the obvious next action, and the text is still
 *   where the person left it.
 * - `outcome_unknown`: cleared from the live composer and retained beside it as
 *   an inert copy that nothing resubmits. Archboard does not retry an unknown
 *   mutation (ADR 0019 and the workbench delivery contract), so leaving the text
 *   armed under the send control would make one keystroke start a second turn
 *   whose predecessor may already be running; clearing it outright would lose
 *   the person's words. The copy is readable and dismissable, and sending it
 *   again is a deliberate retype after reading the workhorse timeline.
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
