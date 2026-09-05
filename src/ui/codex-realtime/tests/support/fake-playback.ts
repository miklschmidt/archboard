// The fake playback objects behind the media session tests: the output meter
// over a playback stream, and the host's media element.

import type { RealtimeMediaStream } from "@/ui/codex-realtime";
import { rootMeanSquareLevel } from "@/ui/voice-output-level";
import type { VoiceOutputMeter, VoiceOutputPlayback } from "@/ui/voice-output-level";

/** What the playback fakes need from the browser that owns them. */
interface FakePlaybackHost {
	readonly onStep?: ((step: string) => void) | undefined;
	readonly pause?: string | undefined;
	readonly fail?: string | undefined;
	readonly costs: ReadonlyMap<string, number>;
	readonly samples: readonly number[];
	readonly staySuspended: boolean;
	readonly autoplayDenied: boolean;
	readonly deferPlay: boolean;
	readonly record: (step: string) => void;
	readonly stage: <T>(stage: "resume", value: T) => Promise<T>;
}

/** The output meter over one playback stream. */
class FakeMeter implements VoiceOutputMeter {
	readonly host: FakePlaybackHost;
	readonly source: VoiceOutputPlayback;
	state: "running" | "suspended" | "closed";
	closeCount = 0;
	readCount = 0;

	/**
	 * Builds a meter.
	 * @param host The fake browser.
	 * @param source The stream being measured.
	 */
	constructor(host: FakePlaybackHost, source: VoiceOutputPlayback) {
		this.host = host;
		this.source = source;
		const suspended = host.pause === "resume" || host.fail === "resume" || host.costs.has("resume");
		this.state = suspended ? "suspended" : "running";
	}

	/**
	 * The playback state.
	 * @returns The state.
	 */
	playback(): "running" | "suspended" | "closed" {
		return this.state;
	}

	/**
	 * Resumes through the resume stage gate.
	 */
	async resume(): Promise<void> {
		await this.host.stage("resume", undefined);
		if (!this.host.staySuspended) {
			this.state = "running";
		}
	}

	/**
	 * Reads the configured samples.
	 * @returns The RMS level.
	 */
	read(): number {
		this.readCount += 1;
		return rootMeanSquareLevel(Uint8Array.from(this.host.samples));
	}

	/**
	 * Closes the meter.
	 */
	close(): void {
		this.closeCount += 1;
		this.state = "closed";
	}
}

/** The host's media element. */
class FakeAudio {
	readonly host: FakePlaybackHost;
	pauseCount = 0;
	loadCount = 0;
	removeCount = 0;
	/** Undefined until something was attached; null once detached. */
	srcObject: RealtimeMediaStream | null | undefined;
	#rejectPlay?: (error: unknown) => void;

	/**
	 * Builds an element.
	 * @param host The fake browser.
	 */
	constructor(host: FakePlaybackHost) {
		this.host = host;
	}

	/**
	 * Starts playback, or refuses as the browser is configured to.
	 * @returns The play promise.
	 */
	play(): Promise<void> {
		if (this.host.onStep !== undefined) {
			this.host.record("play");
		}
		if (this.host.autoplayDenied) {
			return Promise.reject(new DOMException("Playback requires activation.", "NotAllowedError"));
		}
		if (!this.host.deferPlay) {
			return Promise.resolve();
		}
		return new Promise<void>((_resolve, reject) => {
			this.#rejectPlay = reject;
		});
	}

	/**
	 * Rejects a deferred play.
	 * @param message The rejection.
	 */
	reject(message = "Playback requires activation."): void {
		this.#rejectPlay?.(new DOMException(message, "NotAllowedError"));
	}

	/**
	 * Pauses.
	 */
	pause(): void {
		this.pauseCount += 1;
	}

	/**
	 * Removes an attribute.
	 */
	removeAttribute(): void {
		this.removeCount += 1;
	}

	/**
	 * Reloads.
	 */
	load(): void {
		this.loadCount += 1;
	}
}

export { FakeAudio, FakeMeter, type FakePlaybackHost };
