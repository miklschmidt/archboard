// The peer and negotiation stages: connection, listeners, local offer,
// host answer, remote description.

import type { AnswerSdp } from "@/ui/codex-realtime/types/contract";
import type {
	RealtimeDataChannel,
	RealtimeMediaDevices,
	RealtimeMediaTrack,
	RealtimePeer,
} from "@/ui/codex-realtime/lib/environment";
import { listen } from "@/ui/codex-realtime/lib/run";
import type { RealtimeMediaSnapshot, Run } from "@/ui/codex-realtime/lib/run";
import {
	deadlineStep,
	requireMicrophone,
	requirePeer,
	settledIfInactive,
} from "@/ui/codex-realtime/lib/start-support";
import type { RunController, Step } from "@/ui/codex-realtime/lib/start-support";

/**
 * Registers the device-loss listeners on the captured track and the devices.
 * @param controller The session.
 * @param run The run.
 * @param devices The media devices.
 * @param localTrack The captured track.
 * @returns False when the run went inactive while registering.
 */
function listenForDeviceLoss(
	controller: RunController,
	run: Run,
	devices: RealtimeMediaDevices,
	localTrack: RealtimeMediaTrack,
): boolean {
	/**
	 * The microphone was removed.
	 */
	const deviceLost = (): void => {
		void controller.fail(run, "device_lost", "The microphone was removed.");
	};
	listen(run, localTrack, "ended", deviceLost);
	if (controller.inactive(run)) {
		return false;
	}
	listen(run, devices, "devicechange", () => {
		if (localTrack.readyState === "ended") {
			deviceLost();
		}
	});
	return !controller.inactive(run);
}

/**
 * Registers the connection-loss listeners on the peer and the channel.
 * @param controller The session.
 * @param run The run.
 * @param peer The peer.
 * @param channel The events channel.
 * @returns False when the run went inactive while registering.
 */
function listenForConnectionLoss(
	controller: RunController,
	run: Run,
	peer: RealtimePeer,
	channel: RealtimeDataChannel,
): boolean {
	listen(run, peer, "iceconnectionstatechange", () => {
		const state = peer.iceConnectionState;
		if (state === "disconnected" || state === "failed") {
			void controller.fail(run, "ice_disconnected", "The realtime audio connection was lost.");
		}
	});
	if (controller.inactive(run)) {
		return false;
	}
	listen(run, channel, "close", () => {
		void controller.fail(run, "data_channel_closed", "The realtime events channel closed.");
	});
	return !controller.inactive(run);
}

/**
 * The media devices, which the permission stage already proved present.
 * @param controller The session.
 * @returns The devices.
 */
function requireDevices(controller: RunController): RealtimeMediaDevices {
	const devices = controller.environment.mediaDevices();
	if (devices === null) {
		throw new Error("The media devices vanished.");
	}
	return devices;
}

/**
 * The peer stage: connection, transceiver, events channel, listeners.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
async function buildPeer(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	const { stream, track } = requireMicrophone(run);
	const devices = requireDevices(controller);
	const peer = controller.environment.createPeerConnection();
	run.peer = peer;
	if (controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	peer.addTransceiver(track, stream);
	if (controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	const channel = peer.createDataChannel("realtime-events");
	run.channel = channel;
	const registered =
		!controller.inactive(run) &&
		listenForDeviceLoss(controller, run, devices, track) &&
		listenForConnectionLoss(controller, run, peer, channel);
	return registered ? null : controller.settleCancelled(run);
}

/**
 * Creates the local offer and applies it as the local description.
 * @param controller The session.
 * @param run The run.
 * @returns The offer, or the settled snapshot.
 */
async function applyLocalOffer(
	controller: RunController,
	run: Run,
): Promise<Step<RTCSessionDescriptionInit>> {
	const peer = requirePeer(run);
	const offer = await deadlineStep(
		controller,
		run,
		() => peer.createOffer(),
		"Creating the realtime offer timed out.",
	);
	if ("settled" in offer) {
		return offer;
	}
	const localSet = await deadlineStep(
		controller,
		run,
		() => peer.setLocalDescription(offer.value),
		"Setting the realtime offer timed out.",
	);
	return "settled" in localSet ? localSet : offer;
}

/**
 * Publishes the created offer and reads the SDP to send.
 * @param controller The session.
 * @param run The run.
 * @param offer The local offer.
 * @returns The offer SDP, or the settled snapshot.
 */
async function publishLocalOffer(
	controller: RunController,
	run: Run,
	offer: RTCSessionDescriptionInit,
): Promise<Step<string>> {
	controller.publish(run, { phase: "negotiating", reason: "offer_created" });
	if (controller.inactive(run)) {
		return { settled: await controller.settleCancelled(run) };
	}
	const sdp = requirePeer(run).localDescription?.sdp ?? offer.sdp ?? "";
	return controller.inactive(run)
		? { settled: await controller.settleCancelled(run) }
		: { value: sdp };
}

/**
 * Reads the host's answer field by field, each read guarded, so a host
 * that stops the session from inside a getter cannot be trusted past it.
 * @param controller The session.
 * @param run The run.
 * @param answer The host's answer.
 * @returns A plain copy, or null when the run went inactive while reading.
 */
function readAnswer(controller: RunController, run: Run, answer: AnswerSdp): AnswerSdp | null {
	const sessionId = answer.sessionId;
	if (controller.inactive(run)) {
		return null;
	}
	const correlationId = answer.correlationId;
	if (controller.inactive(run)) {
		return null;
	}
	const sdp = answer.sdp;
	return controller.inactive(run) ? null : { sessionId, correlationId, sdp };
}

/**
 * Sends the offer and verifies the answer names this exact run.
 * @param controller The session.
 * @param run The run.
 * @param offerSdp The local offer.
 * @returns The verified answer, or the settled snapshot.
 */
async function verifiedAnswer(
	controller: RunController,
	run: Run,
	offerSdp: string,
): Promise<Step<AnswerSdp>> {
	const answer = await deadlineStep(
		controller,
		run,
		() => {
			run.offerSent = true;
			return controller.host.createOffer({ ...run.correlation, sdp: offerSdp });
		},
		"The realtime answer timed out.",
	);
	if ("settled" in answer) {
		return answer;
	}
	const verified = readAnswer(controller, run, answer.value);
	if (verified === null) {
		return { settled: await controller.settleCancelled(run) };
	}
	if (
		verified.sessionId !== run.correlation.sessionId ||
		verified.correlationId !== run.correlation.correlationId
	) {
		await controller.terminal(
			run,
			"protocol_error",
			"The realtime answer did not match its offer.",
		);
		return { settled: run.snapshot };
	}
	return { value: verified };
}

/**
 * Publishes the received answer and applies it as the remote description.
 * @param controller The session.
 * @param run The run.
 * @param answer The verified answer.
 * @returns The settled snapshot, or null to continue.
 */
async function applyAnswer(
	controller: RunController,
	run: Run,
	answer: AnswerSdp,
): Promise<RealtimeMediaSnapshot | null> {
	controller.publish(run, { phase: "negotiating", reason: "answer_received" });
	if (controller.inactive(run)) {
		return controller.settleCancelled(run);
	}
	const remoteSet = await deadlineStep(
		controller,
		run,
		() => requirePeer(run).setRemoteDescription({ type: "answer", sdp: answer.sdp }),
		"Setting the realtime answer timed out.",
	);
	return "settled" in remoteSet ? remoteSet.settled : settledIfInactive(controller, run);
}

/**
 * The negotiation stage: offer out, answer in.
 * @param controller The session.
 * @param run The run.
 * @returns The settled snapshot, or null to continue.
 */
async function negotiate(
	controller: RunController,
	run: Run,
): Promise<RealtimeMediaSnapshot | null> {
	const offer = await applyLocalOffer(controller, run);
	if ("settled" in offer) {
		return offer.settled;
	}
	const sdp = await publishLocalOffer(controller, run, offer.value);
	if ("settled" in sdp) {
		return sdp.settled;
	}
	const answer = await verifiedAnswer(controller, run, sdp.value);
	if ("settled" in answer) {
		return answer.settled;
	}
	return applyAnswer(controller, run, answer.value);
}

export { buildPeer, negotiate };
