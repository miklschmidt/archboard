// The media owner's published state, its options, and the pure helpers over
// the transport snapshot it reads.

import type { BrowserCommandLease } from "@/shared/codex-browser-model";
import { browserRealtimeMediaSupported } from "@/ui/codex-realtime";
import type {
	AppendOutcome,
	RealtimeCorrelation,
	RealtimeHost,
	createRealtimeMediaSession,
	RealtimeMediaEnvironment,
	RealtimeMediaSession,
	RealtimeMediaSnapshot,
} from "@/ui/codex-realtime";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";
import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import type { StartOperation } from "@/ui/codex-workbench-media/lib/media-host";

/** Where the owner stands: installing, ready to start, or why it cannot. */
type BrowserWorkbenchMediaState =
	| { readonly state: "attaching" }
	| { readonly state: "ready" }
	| {
			readonly state: "unavailable";
			readonly reason:
				| "detached"
				| "socket_closed"
				| "media_api_unavailable"
				| "permission_denied"
				| "negotiation_failed";
			readonly message: string;
	  };

/** The media boundary accepts the shared transport, never a raw socket. */
type BrowserWorkbenchMediaSource = BrowserWorkbenchTransport;

/** Owns local realtime media while the workbench transport owns the canvas socket. */
interface BrowserWorkbenchMediaOwner {
	readonly attach: (transport: BrowserWorkbenchTransport) => Promise<BrowserWorkbenchMediaState>;
	readonly detach: (transport: BrowserWorkbenchTransport) => Promise<void>;
	readonly start: () => Promise<RealtimeMediaSnapshot>;
	readonly appendText: (text: string) => Promise<AppendOutcome>;
	/**
	 * Silences and restores the captured microphone. Neither claims a lease nor
	 * sends a command: the realtime session disables the local audio track it
	 * already owns, so there is no wire operation to authorize. The forwarded
	 * subscription is what publishes the resulting phase.
	 */
	readonly mute: () => Promise<RealtimeMediaSnapshot>;
	readonly unmute: () => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
	readonly snapshot: () => RealtimeMediaSnapshot | null;
	readonly state: () => BrowserWorkbenchMediaState;
	/** The active session's measured model output level, or null between sessions. */
	readonly outputLevel: () => RealtimeMediaSession["outputLevel"] | null;
	/**
	 * Fires whenever `snapshot()` or `state()` may have changed, including the
	 * browser-originated realtime publications that reach only the inner
	 * realtime session: a lost microphone, a dropped ICE connection, a closed
	 * data channel, and every in-start phase.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	readonly dispose: () => Promise<void>;
}

/** Construction options; every default is the real browser. */
interface BrowserWorkbenchMediaOwnerOptions {
	readonly createMediaSession?: typeof createRealtimeMediaSession;
	readonly environment?: RealtimeMediaEnvironment;
	/** Where the remote audio element comes from and is mounted. */
	readonly audioElements?: BrowserAudioElementPort;
	/** Whether this browser can carry realtime media at all. */
	readonly mediaSupported?: () => boolean;
}

/** Creates and mounts the remote audio element. */
interface BrowserAudioElementPort {
	readonly create: () => HTMLAudioElement;
}

/** The lease fields that name one command target. */
type LeaseTarget = Pick<BrowserCommandLease, "commandId" | "paneId" | "childId" | "epoch">;

/**
 * Whether two lease targets name the same command.
 * @param left One target.
 * @param right Another target.
 * @returns True when every identity field matches.
 */
function sameLeaseTarget(left: LeaseTarget, right: LeaseTarget): boolean {
	return (
		left.commandId === right.commandId &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

/**
 * The executable thread the transport is linked to.
 * @param transport The transport.
 * @returns The thread id.
 */
function executableThread(
	transport: BrowserWorkbenchTransport,
): NonNullable<
	Extract<
		NonNullable<ReturnType<BrowserWorkbenchTransport["snapshot"]>>["threadLink"],
		{ readonly state: "executable" }
	>["threadId"]
> {
	const link = transport.snapshot()?.threadLink;
	if (link?.state !== "executable") {
		throw new Error("Realtime requires an executable current pane thread link.");
	}
	return link.threadId;
}

/**
 * The unavailability a browser without media APIs publishes.
 * @param supported Whether the browser carries realtime media.
 * @returns The state, or null when supported.
 */
function capabilityFailure(supported: () => boolean): BrowserWorkbenchMediaState | null {
	if (supported()) {
		return null;
	}
	return {
		state: "unavailable",
		reason: "media_api_unavailable",
		message: "This browser cannot install realtime microphone and audio support.",
	};
}

/**
 * The unavailability a failed start publishes.
 * @param snapshot The realtime snapshot the start ended on.
 * @returns The state.
 */
function unavailableFromSnapshot(snapshot: RealtimeMediaSnapshot): BrowserWorkbenchMediaState {
	const reason = snapshot.state.reason;
	return {
		state: "unavailable",
		reason: reason === "permission_denied" ? "permission_denied" : "negotiation_failed",
		message:
			"message" in snapshot.state
				? snapshot.state.message
				: "Realtime media negotiation did not become ready.",
	};
}

/**
 * Whether the real browser can mount and carry realtime media.
 * @returns True with a document and realtime support.
 */
function browserMediaSupported(): boolean {
	const documentValue: unknown = Reflect.get(globalThis, "document");
	return (
		typeof documentValue === "object" &&
		documentValue !== null &&
		typeof Reflect.get(documentValue, "createElement") === "function" &&
		browserRealtimeMediaSupported()
	);
}

/**
 * The real browser's audio elements.
 * @returns The port.
 */
function browserAudioElements(): BrowserAudioElementPort {
	return Object.freeze({
		/**
		 * A hidden, autoplaying audio element appended to the body.
		 * @returns The element.
		 */
		create: () => {
			const element = document.createElement("audio");
			element.autoplay = true;
			element.setAttribute("playsinline", "");
			element.hidden = true;
			document.body.append(element);
			return element;
		},
	});
}

export {
	browserAudioElements,
	browserMediaSupported,
	capabilityFailure,
	executableThread,
	sameLeaseTarget,
	unavailableFromSnapshot,
	type BrowserAudioElementPort,
	type BrowserWorkbenchMediaOwner,
	type BrowserWorkbenchMediaOwnerOptions,
	type BrowserWorkbenchMediaSource,
	type BrowserWorkbenchMediaState,
};

/** One attached transport and the realtime session bound to it. */
interface MediaRun {
	readonly transport: BrowserWorkbenchTransport;
	readonly mountedElements: Set<HTMLAudioElement>;
	remove: () => void;
	/** Releases this run's subscription to its own realtime media session. */
	releaseMedia: () => void;
	media: RealtimeMediaSession | null;
	host: RealtimeHost | null;
	handle: BrowserCommandLease["commandId"] | null;
	startOperation: StartOperation | null;
	voiceStopRequested: boolean;
	closed: boolean;
}

const LIVE_PHASES: ReadonlySet<RealtimeMediaSnapshot["state"]["phase"]> = new Set([
	"listening",
	"muted",
	"processing",
	"speaking",
]);

/**
 * Removes every audio element the run mounted.
 * @param run The run.
 */
function removeAudioElements(run: MediaRun): void {
	for (const element of run.mountedElements) {
		element.pause();
		element.srcObject = null;
		element.remove();
		run.mountedElements.delete(element);
	}
}

/**
 * Whether the transport's socket is gone rather than merely absent.
 * @param transport The transport.
 * @returns True while a socket is reconnecting or backing off.
 */
function socketLost(transport: BrowserWorkbenchTransport): boolean {
	const state = transport.state();
	return state.kind === "connection" && state.state !== "stopped";
}

/**
 * The unavailability an attach publishes when the transport has no snapshot.
 * @param transport The transport.
 * @returns The state.
 */
function noSnapshotState(transport: BrowserWorkbenchTransport): BrowserWorkbenchMediaState {
	const state = transport.state();
	return {
		state: "unavailable",
		reason: socketLost(transport) ? "socket_closed" : "detached",
		message:
			state.kind === "connection"
				? state.reason
				: "The Codex workbench transport has no full snapshot.",
	};
}

/**
 * The realtime correlation a start lease names.
 * @param lease The start lease.
 * @returns The correlation.
 */
function leaseCorrelation(lease: BrowserCommandLease): RealtimeCorrelation {
	return {
		sessionId: parseRealtimeSessionId(String(lease.commandId)),
		correlationId: parseRealtimeCorrelationId(String(lease.commandId)),
	};
}

/**
 * Whether the host declared voice unavailable under a still-live browser run.
 * @param run The run.
 * @returns True when the run should be stopped for the host.
 */
function hostRevokedVoice(run: MediaRun): boolean {
	const phase = run.media?.getSnapshot().state.phase;
	return (
		run.transport.snapshot()?.voice.state === "unavailable" &&
		!run.voiceStopRequested &&
		phase !== undefined &&
		LIVE_PHASES.has(phase)
	);
}

export {
	hostRevokedVoice,
	leaseCorrelation,
	noSnapshotState,
	removeAudioElements,
	socketLost,
	type MediaRun,
};
