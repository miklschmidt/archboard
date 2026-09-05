// Fakes for the voice session tests: a transport port that records reads and
// a realtime port with its own output level source, both publishing the way
// the real owners do.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import { parseRealtimeCorrelationId, parseRealtimeSessionId } from "@/shared/codex-realtime-host";
import type {
	RealtimeCorrelation,
	RealtimeMediaSnapshot,
	RealtimeState,
} from "@/ui/codex-realtime";
import type { BrowserWorkbenchMediaState } from "@/ui/codex-workbench-media";
import type { VoiceOutputLevelSource } from "@/ui/voice-output-level";
import type { VoiceRealtimePort, VoiceTransportPort } from "@/ui/voice-session";
import { snapshot } from "@/ui/voice-session/tests/support/workbench-fixture";
import type { BrowserWorkbenchCapabilities, BrowserWorkbenchState } from "@/ui/workbench-transport";

/**
 * A correlation whose session and correlation ids are both the given id.
 * @param id The id.
 * @returns The correlation.
 */
function correlation(id: string): RealtimeCorrelation {
	return Object.freeze({
		sessionId: parseRealtimeSessionId(id),
		correlationId: parseRealtimeCorrelationId(id),
	});
}

const CORRELATION: RealtimeCorrelation = correlation("session-1");

/**
 * A media snapshot on the default correlation.
 * @param state The realtime state.
 * @param overrides Fields to change.
 * @returns The snapshot.
 */
function mediaSnapshot(
	state: RealtimeState,
	overrides: Partial<RealtimeMediaSnapshot> = {},
): RealtimeMediaSnapshot {
	return Object.freeze({ correlation: CORRELATION, state, ...overrides });
}

/**
 * A connected readiness state over a snapshot.
 * @param value The snapshot.
 * @returns The transport state.
 */
function connectedState(value: BrowserSnapshot = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

/**
 * A reconnecting state, with or without a retained snapshot.
 * @param value The retained snapshot, or null.
 * @returns The transport state.
 */
function reconnectingState(value: BrowserSnapshot | null = null): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: value,
		sequence: value === null ? null : 7,
		reason: "The Codex workbench connection dropped.",
	};
}

/**
 * A stale-stream state over a snapshot.
 * @param value The snapshot.
 * @returns The transport state.
 */
function staleState(value: BrowserSnapshot = snapshot()): BrowserWorkbenchState {
	return {
		kind: "stream",
		state: "stale_snapshot",
		connection: "connected",
		snapshot: value,
		sequence: 7,
		expectedSequence: 8,
		receivedSequence: 12,
		reason: "The Codex workbench stream skipped a sequence.",
	};
}

/**
 * Full capabilities, with overrides.
 * @param overrides Fields to change.
 * @returns The capabilities.
 */
function capabilities(
	overrides: Partial<BrowserWorkbenchCapabilities> = {},
): BrowserWorkbenchCapabilities {
	return {
		connected: true,
		readiness: "thread_capable",
		canReadAccount: true,
		canClaimLease: true,
		canRenewLease: true,
		canReleaseLease: true,
		canCommand: true,
		canThreadCommands: true,
		canRealtime: true,
		/**
		 * Every command.
		 * @returns True.
		 */
		supportsCommand: () => true,
		...overrides,
	};
}

/**
 * Does nothing.
 */
function noop(): void {
	// Nothing to do.
}

/** The transport fake, counting reads and listeners. */
interface TransportFake extends VoiceTransportPort {
	readonly set: (state: BrowserWorkbenchState) => void;
	readonly setCapabilities: (value: BrowserWorkbenchCapabilities) => void;
	readonly listenerCount: () => number;
	readonly reads: () => number;
}

/**
 * A transport fake.
 * @param initial The initial state.
 * @returns The fake.
 */
function transportFake(initial: BrowserWorkbenchState = connectedState()): TransportFake {
	let state = initial;
	let caps = capabilities();
	let reads = 0;
	const listeners = new Set<() => void>();
	/**
	 * Tells every listener.
	 */
	const notify = (): void => {
		const notified = [...listeners];
		for (const listener of notified) {
			listener();
		}
	};
	return {
		/**
		 * The state, counted.
		 * @returns The state.
		 */
		state: () => {
			reads += 1;
			return state;
		},
		/**
		 * The snapshot, counted.
		 * @returns The snapshot.
		 */
		snapshot: () => {
			reads += 1;
			return state.snapshot;
		},
		/**
		 * The capabilities, counted.
		 * @returns The capabilities.
		 */
		capabilities: () => {
			reads += 1;
			return caps;
		},
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Publishes a state.
		 * @param next The state.
		 */
		set: (next) => {
			state = next;
			notify();
		},
		/**
		 * Publishes capabilities.
		 * @param value The capabilities.
		 */
		setCapabilities: (value) => {
			caps = value;
			notify();
		},
		/**
		 * How many listeners are attached.
		 * @returns The count.
		 */
		listenerCount: () => listeners.size,
		/**
		 * How many reads happened.
		 * @returns The count.
		 */
		reads: () => reads,
	};
}

/** A level source the test drives. */
interface LevelFake extends VoiceOutputLevelSource {
	readonly set: (level: number) => void;
	readonly listenerCount: () => number;
}

/**
 * A level source fake.
 * @returns The fake.
 */
function levelFake(): LevelFake {
	let level = 0;
	const listeners = new Set<(level: number) => void>();
	return {
		/**
		 * The level.
		 * @returns The level.
		 */
		current: () => level,
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Follows nothing.
		 */
		follow: noop,
		/**
		 * Settles to silence.
		 */
		settle: () => {
			level = 0;
		},
		/**
		 * Disposes.
		 */
		dispose: () => {
			listeners.clear();
		},
		/**
		 * Publishes a level.
		 * @param next The level.
		 */
		set: (next) => {
			level = next;
			const notified = [...listeners];
			for (const listener of notified) {
				listener(next);
			}
		},
		/**
		 * How many listeners are attached.
		 * @returns The count.
		 */
		listenerCount: () => listeners.size,
	};
}

/** The realtime fake, recording every control. */
interface RealtimeFake extends VoiceRealtimePort {
	readonly set: (
		snapshot: RealtimeMediaSnapshot | null,
		state?: BrowserWorkbenchMediaState,
	) => void;
	readonly setState: (state: BrowserWorkbenchMediaState) => void;
	readonly onStart: (handler: () => Promise<RealtimeMediaSnapshot>) => void;
	readonly onStop: (handler: () => Promise<RealtimeMediaSnapshot>) => void;
	readonly onMute: (handler: (muted: boolean) => Promise<RealtimeMediaSnapshot>) => void;
	/** The output level source the port currently hands out. */
	readonly levels: LevelFake;
	readonly calls: () => readonly string[];
	readonly listenerCount: () => number;
}

/**
 * A realtime fake.
 * @param initial The initial media snapshot.
 * @param initialState The initial owner state.
 * @returns The fake.
 */
function realtimeFake(
	initial: RealtimeMediaSnapshot | null = null,
	initialState: BrowserWorkbenchMediaState = { state: "ready" },
): RealtimeFake {
	let media = initial;
	let ownerState = initialState;
	const calls: string[] = [];
	const listeners = new Set<() => void>();
	const levels = levelFake();
	/**
	 * Tells every listener.
	 */
	const publish = (): void => {
		const notified = [...listeners];
		for (const listener of notified) {
			listener();
		}
	};
	/**
	 * Publishes a media snapshot, as the real owner publishes every change it makes.
	 * @param next The snapshot.
	 * @returns The snapshot.
	 */
	const setMedia = (next: RealtimeMediaSnapshot): RealtimeMediaSnapshot => {
		media = next;
		publish();
		return next;
	};
	/**
	 * The default start: listening.
	 * @returns The snapshot.
	 */
	let startHandler = (): Promise<RealtimeMediaSnapshot> =>
		Promise.resolve(
			setMedia(mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" })),
		);
	/**
	 * The default stop: closed.
	 * @returns The snapshot.
	 */
	let stopHandler = (): Promise<RealtimeMediaSnapshot> =>
		Promise.resolve(setMedia(mediaSnapshot({ phase: "closed", reason: "stopped" })));
	/**
	 * The default mute toggle: the new phase.
	 * @param muted Whether muting.
	 * @returns The snapshot.
	 */
	let muteHandler = (muted: boolean): Promise<RealtimeMediaSnapshot> =>
		Promise.resolve(
			setMedia(
				mediaSnapshot(
					muted
						? { phase: "muted", reason: "mute_requested" }
						: { phase: "listening", reason: "unmute_requested" },
				),
			),
		);
	return {
		/**
		 * The media snapshot.
		 * @returns The snapshot, or null.
		 */
		snapshot: () => media,
		/**
		 * The owner state.
		 * @returns The state.
		 */
		state: () => ownerState,
		/**
		 * The level source.
		 * @returns The fake source.
		 */
		outputLevel: () => levels,
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Starts.
		 * @returns The snapshot.
		 */
		start: () => {
			calls.push("start");
			return startHandler();
		},
		/**
		 * Mutes.
		 * @returns The snapshot.
		 */
		mute: () => {
			calls.push("mute");
			return muteHandler(true);
		},
		/**
		 * Unmutes.
		 * @returns The snapshot.
		 */
		unmute: () => {
			calls.push("unmute");
			return muteHandler(false);
		},
		/**
		 * Stops.
		 * @returns The snapshot.
		 */
		stop: () => {
			calls.push("stop");
			return stopHandler();
		},
		/**
		 * Publishes a snapshot and optionally an owner state.
		 * @param next The snapshot.
		 * @param state The owner state.
		 */
		set: (next, state) => {
			media = next;
			if (state !== undefined) {
				ownerState = state;
			}
			publish();
		},
		/**
		 * Publishes an owner state.
		 * @param state The owner state.
		 */
		setState: (state) => {
			ownerState = state;
			publish();
		},
		/**
		 * Replaces the start handler.
		 * @param handler The handler.
		 */
		onStart: (handler) => {
			startHandler = handler;
		},
		/**
		 * Replaces the stop handler.
		 * @param handler The handler.
		 */
		onStop: (handler) => {
			stopHandler = handler;
		},
		/**
		 * Replaces the mute handler.
		 * @param handler The handler.
		 */
		onMute: (handler) => {
			muteHandler = handler;
		},
		levels,
		/**
		 * Every control called.
		 * @returns The calls.
		 */
		calls: () => [...calls],
		/**
		 * How many listeners are attached.
		 * @returns The count.
		 */
		listenerCount: () => listeners.size,
	};
}

export {
	CORRELATION,
	capabilities,
	connectedState,
	correlation,
	mediaSnapshot,
	realtimeFake,
	reconnectingState,
	staleState,
	transportFake,
	type LevelFake,
	type RealtimeFake,
	type TransportFake,
};
