// What happens to the text a person typed, per settled outcome. This is the
// whole policy, in one place, because getting it wrong either loses somebody's
// words or sends them twice.
//
// - `delivered`: cleared. The host published an authoritative turn carrying
//   the message, so keeping the text would invite a duplicate turn.
// - `not_delivered`: left in the live composer. Nothing reached the workhorse,
//   so resending is safe and is the obvious next action.
// - `outcome_unknown`: cleared from the live composer and retained beside it
//   as an inert copy that nothing resubmits. Archboard does not retry an
//   unknown mutation (ADR 0019), so leaving the text armed under the send
//   control would make one keystroke start a second turn whose predecessor
//   may already be running; clearing it outright would lose the words.

import type { DeliveryOutcome } from "@/shared/codex-browser-model";
import type { WorkbenchComposerDraftDisposition } from "@/ui/workbench-composer/lib/contract";

const DISPOSITIONS: Readonly<Record<DeliveryOutcome, WorkbenchComposerDraftDisposition>> = {
	delivered: "cleared",
	not_delivered: "restored",
	outcome_unknown: "retained",
};

/**
 * The disposition of the typed text for one settled outcome.
 * @param outcome The settled outcome.
 * @returns Cleared, restored or retained.
 */
function composerDraftDisposition(outcome: DeliveryOutcome): WorkbenchComposerDraftDisposition {
	return DISPOSITIONS[outcome];
}

export { composerDraftDisposition };
