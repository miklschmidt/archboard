// The playback stage: the remote stream is built from the peer's receivers
// and offered to the host's element, the output meter is built over that same
// remote stream, and the run publishes listening.

import { detachRemote, errorMessage } from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import {
	deadlineStep,
	requirePeer,
	settledIfInactive,
} from "@/ui/codex-realtime/lib/start-support";
import type { RunController } from "@/ui/codex-realtime/lib/start-support";
import type { VoiceOutputMeter } from "@/ui/voice-output-level";

/**
 * Whether a play() rejection still belongs to the element it was raised on.
 * @param controller The session.
 * @param run The run.
 * @param element The element play() was called on.
 * @param generation The attachment generation at that time.
 * @returns True when the rejection is current.
 */
function playRejectionCurrent(
	controller: RunController,
	run: Run,
	element: HTMLMediaElement,
	generation: number,
): boolean {
	return (
		!controller.inactive(run) &&
		run.remoteElement === element &&
		run.attachmentGeneration === generation
	);
}

/**
 * Starts playback on the attached element; a refused play is blocked autoplay.
 * @param controller The session.
 * @param run The run.
 * @param element The element.
 */
function startPlayback(controller: RunController, run: Run, element: HTMLMediaElement): void {
	const generation = run.attachmentGeneration;
	void element.play().catch((error: unknown) => {
		if (!playRejectionCurrent(controller, run, element, generation)) {
			return undefined;
		}
		return controller.fail(
			run,
			"autoplay_suspended",
			errorMessage(error, "Remote audio is suspended."),
		);
	});
}

/**
 * Attaches the remote stream to one element and starts playback.
 * @param controller The session.
 * @param run The run.
 * @param element The host's media element.
 */
function attachElement(controller: RunController, run: Run, element: HTMLMediaElement): void {
	const stream = run.remoteStream;
	if (controller.inactive(run) || stream === undefined) {
		return;
	}
	detachRemote(run);
	if (controller.inactive(run)) {
		return;
	}
	run.remoteElement = element;
	try {
		controller.environment.attachPlayback(element, stream);
		if (!controller.inactive(run)) {
			startPlayback(controller, run, element);
		}
	} catch (error) {
		void controller.fail(run, "remote_media_failed", errorMessage(error, "Remote audio failed."));
	}
}

/**
 * Builds the remote stream from the peer's receivers and offers it to the host.
 * @param controller The session.
 * @param run The run.
 */
function attachRemote(controller: RunController, run: Run): void {
	const receivers = requirePeer(run).getReceivers();
	if (controller.inactive(run)) {
		return;
	}
	run.remoteStream = controller.environment.createMediaStream(
		receivers.map((receiver) => receiver.track),
	);
	if (controller.inactive(run)) {
		return;
	}
	controller.host.attachRemoteMedia({
		...run.correlation,
		/**
		 * Attaches the remote stream to the host's element.
		 * @param element The element.
		 */
		attachTo: (element) => {
			attachElement(controller, run, element);
		},
	});
}

/**
 * Resumes a suspended meter; a graph that stays suspended is blocked autoplay.
 * @param controller The session.
 * @param run The run.
 * @param meter The output meter.
 */
async function resumeMeter(
	controller: RunController,
	run: Run,
	meter: VoiceOutputMeter,
): Promise<void> {
	if (meter.playback() !== "suspended") {
		return;
	}
	await meter.resume();
	if (controller.inactive(run)) {
		return;
	}
	if (meter.playback() === "suspended") {
		throw new DOMException("Audio playback remains suspended.", "NotAllowedError");
	}
}

/**
 * Builds the output meter over the remote playback and hands it to the level source.
 * @param controller The session.
 * @param run The run.
 */
async function followPlayback(controller: RunController, run: Run): Promise<void> {
	const stream = run.remoteStream;
	if (stream === undefined) {
		throw new Error("The remote stream is absent.");
	}
	if (controller.inactive(run)) {
		return;
	}
	const meter = controller.environment.analysePlayback(stream);
	if (meter === null) {
		throw new Error("Remote audio cannot be analysed in this browser.");
	}
	run.meter = meter;
	if (controller.inactive(run)) {
		// The release already ran while the meter was being built; it never saw it.
		run.meter = undefined;
		meter.close();
		return;
	}
	await resumeMeter(controller, run, meter);
	if (controller.inactive(run)) {
		return;
	}
	run.meterFollowed = true;
	controller.outputLevel.follow(meter);
}

/**
 * Offers the remote stream to the host, failing the run when that throws.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
async function attachPlayback(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	try {
		attachRemote(controller, run);
	} catch (error) {
		await controller.fail(
			run,
			"remote_media_failed",
			errorMessage(error, "Remote audio could not be attached."),
		);
		return run.snapshot;
	}
	return settledIfInactive(controller, run);
}

/**
 * Meters the playback and publishes listening.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null when listening began.
 */
async function meterAndListen(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	const metered = await deadlineStep(
		controller,
		run,
		() => followPlayback(controller, run),
		"Starting the audio meter timed out.",
	);
	if ("settled" in metered) {
		return metered.settled;
	}
	if (run.cancelledNow || run.failed) {
		return controller.settleCancelled(run);
	}
	controller.publish(run, { phase: "listening", reason: "negotiation_succeeded" });
	return settledIfInactive(controller, run);
}

/**
 * The playback stage: remote media attached, output metered, listening.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null when listening began.
 */
async function attachAndListen(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	const attached = await attachPlayback(controller, run);
	return attached ?? meterAndListen(controller, run);
}

export { attachAndListen };
