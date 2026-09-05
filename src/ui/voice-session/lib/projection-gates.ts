// Why a start is blocked, and which failures arrive from outside the realtime
// state machine: the transport, the media owner, and the host's coordinator
// and voice projections.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { BrowserWorkbenchMediaState } from "@/ui/codex-workbench-media";
import type {
	VoiceSessionFailure,
	VoiceSessionFailureCode,
	VoiceSessionProjectionInput,
} from "@/ui/voice-session/contract";
import { presentedFailure } from "@/ui/voice-session/lib/failure";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

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
 * Why each host coordinator state blocks a start, exhaustive over the published
 * union, so a state added to the browser model is a type error here until it is
 * decided.
 */
const COORDINATOR_BLOCKERS = {
	unbound: "The host has no coordinator bound to this pane for voice.",
	starting: "The host is still confirming the voice coordinator.",
	reconnecting: "The host is reconnecting the voice coordinator.",
	failed: "The host has no usable coordinator for voice.",
	ready: null,
	active: null,
} as const satisfies Record<BrowserSnapshot["coordinator"]["state"], string | null>;

const VOICE_BLOCKERS = {
	unavailable: "The host reports that voice is unavailable on this pane.",
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
 * Why the host's published snapshot cannot anchor a start, or null when it can.
 * @param input The projection input.
 * @param snapshot The published snapshot.
 * @returns The blocker sentence, or null.
 */
function hostBlocker(input: VoiceSessionProjectionInput, snapshot: BrowserSnapshot): string | null {
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
 * Why the host's coordinator or voice projection blocks a start, or null.
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
		return "The host has not published a workbench snapshot yet.";
	}
	return hostBlocker(input, snapshot);
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
	return snapshot === null ? null : hostFailure(snapshot);
}

/**
 * A coordinator or voice failure the host published.
 * @param snapshot The published snapshot.
 * @returns The failure, or null.
 */
function hostFailure(snapshot: BrowserSnapshot): VoiceSessionFailure | null {
	if (snapshot.coordinator.state === "failed") {
		return presentedFailure(
			"coordinator",
			snapshot.coordinator.reason ?? "The host reported that the voice coordinator failed.",
		);
	}
	if (snapshot.voice.state === "failed") {
		return presentedFailure(
			"host_voice",
			snapshot.voice.reason ?? "The host reported that the voice session failed.",
		);
	}
	return null;
}

export { externalFailure, startBlocker };
