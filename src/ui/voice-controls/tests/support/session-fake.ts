import type { VoiceSession, VoiceSessionView } from "../../../voice-session/index.js";
import type { VoiceControlCommand } from "../../index.js";

interface Deferred {
	readonly command: VoiceControlCommand;
	readonly settle: (view?: VoiceSessionView) => void;
}

export interface SessionFake extends VoiceSession {
	/** Every command the control emitted, in order. */
	readonly calls: () => readonly VoiceControlCommand[];
	/** Publishes a new view to the control's subscribers. */
	readonly publish: (view: VoiceSessionView) => void;
	/** Publishes a new microphone level on the level channel alone. */
	readonly publishLevel: (level: number) => void;
	/** Resolves the oldest unsettled command, optionally with a new view. */
	readonly settle: (view?: VoiceSessionView) => void;
	readonly unsettled: () => number;
	readonly statusListeners: () => number;
	readonly levelListeners: () => number;
	readonly disposeCount: () => number;
}

/**
 * A stand-in for the presentation adapter that holds every command open until
 * the test settles it. It exists so a pending, repeated, or late press can be
 * observed exactly, which no real timing would make deterministic.
 */
/** A subscriber cannot take ownership of the lifecycle, so notify a copy. */
function announce(targets: Set<() => void>): void {
	for (const listener of Array.from(targets)) listener();
}

export function sessionFake(initial: VoiceSessionView, initialLevel = 0): SessionFake {
	let view = initial;
	let level = initialLevel;
	let disposeCount = 0;
	const calls: VoiceControlCommand[] = [];
	const pending: Deferred[] = [];
	const listeners = new Set<() => void>();
	const levelListeners = new Set<() => void>();
	const command = (name: VoiceControlCommand): Promise<VoiceSessionView> => {
		calls.push(name);
		return new Promise<VoiceSessionView>((resolve) => {
			pending.push({
				command: name,
				settle: (next) => {
					if (next !== undefined) {
						view = next;
						announce(listeners);
					}
					resolve(view);
				},
			});
		});
	};
	return {
		view: () => view,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => level,
		subscribeLevel: (listener: () => void) => {
			levelListeners.add(listener);
			return () => levelListeners.delete(listener);
		},
		refresh: () => view,
		start: () => command("start"),
		mute: () => command("mute"),
		unmute: () => command("unmute"),
		stop: () => command("stop"),
		restart: () => command("restart"),
		close: () => command("close"),
		dispose: () => {
			disposeCount += 1;
			listeners.clear();
			levelListeners.clear();
		},
		calls: () => [...calls],
		publish: (next) => {
			view = next;
			announce(listeners);
		},
		publishLevel: (next) => {
			level = next;
			announce(levelListeners);
		},
		settle: (next) => pending.shift()?.settle(next),
		unsettled: () => pending.length,
		statusListeners: () => listeners.size,
		levelListeners: () => levelListeners.size,
		disposeCount: () => disposeCount,
	};
}
