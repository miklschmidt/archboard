// The start sequence of one run: microphone, support, peer, negotiation,
// playback. Every browser side effect is followed by an activity check so a
// stop or a failure raised during it blocks the next.

import { errorMessage } from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import { checkSupport, requestMicrophone } from "@/ui/codex-realtime/lib/start-microphone";
import { buildPeer, negotiate } from "@/ui/codex-realtime/lib/start-negotiation";
import { attachAndListen } from "@/ui/codex-realtime/lib/start-playback";
import type { RunController, Stage } from "@/ui/codex-realtime/lib/start-support";

/**
 * Runs stages in order until one settles the run.
 * @param controller The session.
 * @param run The run.
 * @param stages The remaining stages.
 * @returns The run's final snapshot for this sequence.
 */
async function runStages(
	controller: RunController,
	run: Run,
	stages: readonly Stage[],
): Promise<RealtimeMediaSnapshot> {
	const [stage, ...rest] = stages;
	if (stage === undefined) {
		return run.snapshot;
	}
	const settled = await stage(controller, run);
	return settled ?? runStages(controller, run, rest);
}

/**
 * Maps a thrown negotiation error onto its recoverable state.
 * @param controller The session.
 * @param run The run.
 * @param error What was thrown.
 * @returns The run's snapshot after the failure.
 */
async function negotiationFailure(
	controller: RunController,
	run: Run,
	error: unknown,
): Promise<RealtimeMediaSnapshot> {
	if (run.cancelledNow || run.failed) {
		return controller.settleCancelled(run);
	}
	if (error instanceof DOMException && error.name === "NotAllowedError") {
		await controller.fail(run, "autoplay_suspended", error.message);
	} else {
		await controller.fail(run, "sdp_failed", errorMessage(error, "Realtime negotiation failed."));
	}
	return run.snapshot;
}

const PREPARATION_STAGES: readonly Stage[] = Object.freeze([requestMicrophone, checkSupport]);
const NEGOTIATION_STAGES: readonly Stage[] = Object.freeze([buildPeer, negotiate, attachAndListen]);

/**
 * Takes an activated run from its permission request to listening.
 * @param controller The session.
 * @param run The activated run.
 * @returns The run's snapshot when the sequence settled.
 */
async function negotiateRun(controller: RunController, run: Run): Promise<RealtimeMediaSnapshot> {
	const prepared = await runStages(controller, run, PREPARATION_STAGES);
	if (run.failed || run.cancelledNow || run.state.phase !== "negotiating") {
		return prepared;
	}
	try {
		return await runStages(controller, run, NEGOTIATION_STAGES);
	} catch (error) {
		return negotiationFailure(controller, run, error);
	}
}

export { negotiateRun };
