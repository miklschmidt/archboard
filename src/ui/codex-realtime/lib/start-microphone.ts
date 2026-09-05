// The permission and support stages: the microphone is requested, adopted,
// and the browser's realtime support confirmed before any peer exists.

import { CODEX_REALTIME_START_MS } from "@/shared/timing/timing";
import type {
	RealtimeMediaDevices,
	RealtimeMediaStream,
} from "@/ui/codex-realtime/lib/environment";
import { CANCELLED, stopTrack } from "@/ui/codex-realtime/lib/run";
import type { Cancelled, RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import { permissionFailure, settledIfInactive } from "@/ui/codex-realtime/lib/start-support";
import type { PermissionFailure, RunController } from "@/ui/codex-realtime/lib/start-support";

/**
 * Requests the microphone, stopping a capture that lands after cancellation.
 * @param run The run.
 * @param devices The media devices.
 * @returns The stream, the cancelled marker, or the classified refusal.
 */
async function openMicrophone(
	run: Run,
	devices: RealtimeMediaDevices,
): Promise<RealtimeMediaStream | Cancelled | PermissionFailure> {
	let microphone: Promise<RealtimeMediaStream>;
	try {
		microphone = devices.getUserMedia({ audio: true, video: false });
	} catch (error) {
		return permissionFailure(error);
	}
	void microphone.then(
		(stream) => {
			if (run.cancelledNow) {
				for (const track of stream.getTracks()) {
					stopTrack(run, track);
				}
			}
			return undefined;
		},
		() => undefined,
	);
	try {
		return await Promise.race([microphone, run.cancelled]);
	} catch (error) {
		return permissionFailure(error);
	}
}

/**
 * Adopts the captured stream: the start deadline begins, and a stream with no
 * audio track is a missing device.
 * @param controller The session.
 * @param run The run.
 * @param stream The captured stream.
 * @returns The settled snapshot, or null to continue.
 */
async function adoptMicrophone(
	controller: RunController,
	run: Run,
	stream: RealtimeMediaStream,
): Promise<RealtimeMediaSnapshot | null> {
	run.localStream = stream;
	run.startDeadline = controller.environment.now() + CODEX_REALTIME_START_MS;
	const localTrack = stream.getAudioTracks()[0];
	if (controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	if (localTrack === undefined) {
		await controller.fail(run, "device_unavailable", "No audio track was captured.");
		return run.snapshot;
	}
	controller.publish(run, { phase: "negotiating", reason: "permission_granted" });
	return settledIfInactive(controller, run);
}

/**
 * The permission stage.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
async function requestMicrophone(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	const devices = controller.environment.mediaDevices();
	if (controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	if (devices === null) {
		await controller.fail(run, "device_unavailable", "This browser cannot request a microphone.");
		return run.snapshot;
	}
	const captured = await openMicrophone(run, devices);
	if (captured === CANCELLED || controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	if ("reason" in captured) {
		await controller.fail(run, captured.reason, captured.message);
		return run.snapshot;
	}
	return adoptMicrophone(controller, run, captured);
}

/**
 * The support stage: a browser without WebRTC, MediaStream, Web Audio or
 * animation frames is a terminal condition.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
async function checkSupport(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	if (controller.environment.realtimeSupported()) {
		return null;
	}
	await controller.terminal(
		run,
		"unsupported_browser",
		"This browser lacks realtime audio support.",
	);
	return run.snapshot;
}

export { checkSupport, requestMicrophone };
