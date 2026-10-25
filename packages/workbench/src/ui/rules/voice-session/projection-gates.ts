// Why a start is blocked, and which failures arrive from outside the realtime
// state machine: the transport, the media owner, and the server's coordinator
// and voice projections.

import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import type {
	BrowserWorkbenchMediaState,
	BrowserWorkbenchState,
} from "@archboard/codex-realtime-voice/controllers";
import type {
	VoiceSessionFailure,
	VoiceSessionFailureCode,
	VoiceSessionProjectionInput,
} from "#ui/state/voice-session/contract.ts";
import { presentedFailure } from "#ui/rules/voice-session/failure.ts";

type MediaUnavailable = Extract<BrowserWorkbenchMediaState, { readonly state: "unavailable" }>;

/**
 * `detached` and `socket_closed` say the workbench is absent, not that voice
 * broke, so they carry no failure and present as plain unavailability.
 */
const MEDIA_UNAVAILABLE_FAILURES = {
	media_api_unavailable: "browser",
	permission_denied: "permission",
	negotiation_failed: "realtime",
	detached: null,
	socket_closed: null,
} as const satisfies Record<MediaUnavailable["reason"], VoiceSessionFailureCode | null>;

/**
 * Why each server coordinator state blocks a start, exhaustive over the published
 * union, so a state added to the browser model is a type error here until it is
 * decided.
 */
const COORDINATOR_BLOCKERS = {
	unbound: "The Archboard server has no coordinator bound to this pane for voice.",
	starting: "The Archboard server is still confirming the voice coordinator.",
	reconnecting: "The Archboard server is reconnecting the voice coordinator.",
	failed: "The Archboard server has no usable coordinator for voice.",
	ready: null,
	active: null,
} as const satisfies Record<BrowserSnapshot["coordinator"]["state"], string | null>;

const VOICE_BLOCKERS = {
	unavailable: "The Archboard server reports that voice is unavailable on this pane.",
	ready: null,
	starting: null,
	active: null,
	recovering: null,
	stopping: null,
	failed: null,
} as const satisfies Record<BrowserSnapshot["voice"]["state"], string | null>;

/**
 * Why the transport cannot anchor a start, or null when it can.
 * @param transportState The transport's state.
 * @returns The blocker sentence, or null.
 */
function transportBlocker(transportState: BrowserWorkbenchState): string | null {
	if (transportState.kind === "connection") {
		return transportState.state === "incompatible_contract"
			? "The Codex workbench gateway speaks an incompatible contract."
			: transportState.reason;
	}
	// A stale snapshot is a connected socket whose stream lost its place. What it
	// is showing is no longer known to be current, so it cannot anchor a start.
	return transportState.kind === "stream" ? transportState.reason : null;
}

/**
 * Why the media owner cannot start, or null when it can.
 * @param mediaState The owner's state.
 * @returns The blocker sentence, or null.
 */
function mediaBlocker(mediaState: BrowserWorkbenchMediaState): string | null {
	if (mediaState.state === "attaching") {
		return "Archboard is installing realtime microphone and audio support in this browser.";
	}
	return mediaState.state === "unavailable" ? mediaState.message : null;
}

/**
 * Why the server's published snapshot cannot anchor a start, or null when it can.
 * @param input The projection input.
 * @param snapshot The published snapshot.
 * @returns The blocker sentence, or null.
 */
function serverBlocker(
	input: VoiceSessionProjectionInput,
	snapshot: BrowserSnapshot,
): string | null {
	const { capabilities } = input;
	if (!capabilities.connected) {
		return "The Codex workbench is not connected.";
	}
	if (capabilities.readiness !== "thread_capable") {
		return "The Codex workbench is not ready for thread work yet.";
	}
	if (snapshot.threadLink.state !== "executable") {
		return "This pane has no executable thread link to bind a voice session to.";
	}
	if (!capabilities.canClaimLease) {
		return "This pane cannot claim the command lease a voice session needs.";
	}
	return coordinatorBlocker(snapshot);
}

/**
 * Why the server's coordinator or voice projection blocks a start, or null.
 * @param snapshot The published snapshot.
 * @returns The blocker sentence, or null.
 */
function coordinatorBlocker(snapshot: BrowserSnapshot): string | null {
	const coordinator = COORDINATOR_BLOCKERS[snapshot.coordinator.state];
	if (coordinator !== null) {
		return snapshot.coordinator.reason ?? coordinator;
	}
	const voice = VOICE_BLOCKERS[snapshot.voice.state];
	return voice === null ? null : (snapshot.voice.reason ?? voice);
}

/**
 * Why the workbench cannot offer a start right now, or null when it can.
 * @param input The projection input.
 * @returns The blocker sentence, or null.
 */
function startBlocker(input: VoiceSessionProjectionInput): string | null {
	const transport = transportBlocker(input.transportState);
	if (transport !== null) {
		return transport;
	}
	const media = mediaBlocker(input.mediaState);
	if (media !== null) {
		return media;
	}
	const snapshot = input.transportState.snapshot;
	if (snapshot === null) {
		return "The Archboard server has not published a workbench snapshot yet.";
	}
	return serverBlocker(input, snapshot);
}

/**
 * A failure published outside the realtime state machine, if there is one.
 * @param mediaState The owner's state.
 * @param snapshot The published snapshot, if any.
 * @returns The failure, or null.
 */
function externalFailure(
	mediaState: BrowserWorkbenchMediaState,
	snapshot: BrowserSnapshot | null,
): VoiceSessionFailure | null {
	if (mediaState.state === "unavailable") {
		const code = MEDIA_UNAVAILABLE_FAILURES[mediaState.reason];
		if (code !== null) {
			return presentedFailure(code, mediaState.message);
		}
	}
	return snapshot === null ? null : serverFailure(snapshot);
}

/**
 * A coordinator or voice failure the server published.
 * @param snapshot The published snapshot.
 * @returns The failure, or null.
 */
function serverFailure(snapshot: BrowserSnapshot): VoiceSessionFailure | null {
	if (snapshot.coordinator.state === "failed") {
		return presentedFailure(
			"coordinator",
			snapshot.coordinator.reason ??
				"The Archboard server reported that the voice coordinator failed.",
		);
	}
	if (snapshot.voice.state === "failed") {
		return presentedFailure(
			"server_voice",
			snapshot.voice.reason ?? "The Archboard server reported that the voice session failed.",
		);
	}
	return null;
}

export { externalFailure, startBlocker };
