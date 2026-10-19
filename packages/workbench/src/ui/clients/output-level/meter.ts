// The output meter port: what the level source reads each frame, and the one
// real implementation over Web Audio. The port is deliberately high level so a
// test can stand in a fake without imitating AudioContext node graphs.

/** A playback stream is anything carrying audio tracks: a MediaStream, or the realtime module's remote stream port. */
interface VoiceOutputPlayback {
	readonly getAudioTracks: () => ReadonlyArray<Pick<MediaStreamTrack, "readyState">>;
}

/** Whether the audio graph behind a meter is producing samples. */
type VoiceOutputPlaybackState = "running" | "suspended" | "closed";

/** One measured playback stream. `read` is called once per animation frame. */
interface VoiceOutputMeter {
	/** The playback state right now; `suspended` means autoplay policy holds the graph. */
	readonly playback: () => VoiceOutputPlaybackState;
	/** Asks the graph to run; resolves whatever the resulting state is. */
	readonly resume: () => Promise<void>;
	/** The root-mean-square level of the latest output frame, 0..1. */
	readonly read: () => number;
	/** Releases the graph. Idempotent. */
	readonly close: () => void;
}

/** Builds a meter over one playback stream, or null when the browser cannot analyse audio. */
type VoiceOutputMeterFactory = (playback: VoiceOutputPlayback) => VoiceOutputMeter | null;

/**
 * The root-mean-square level of byte time-domain samples centred on 128.
 * @param samples One analyser frame.
 * @returns A level in 0..1; silence is 0.
 */
function rootMeanSquareLevel(samples: Uint8Array): number {
	if (samples.length === 0) {
		return 0;
	}
	let sum = 0;
	for (const sample of samples) {
		const normalized = (sample - 128) / 128;
		sum += normalized * normalized;
	}
	return Math.min(1, Math.sqrt(sum / samples.length));
}

/**
 * Maps the AudioContext state onto the meter's playback vocabulary.
 * @param state The context state.
 * @returns Running, suspended or closed.
 */
function playbackState(state: AudioContextState): VoiceOutputPlaybackState {
	if (state === "running") {
		return "running";
	}
	return state === "closed" ? "closed" : "suspended";
}

/**
 * Whether this browser can build a Web Audio analyser over a MediaStream.
 * @returns True when AudioContext and MediaStream exist.
 */
function webAudioSupported(): boolean {
	return (
		typeof globalThis.AudioContext === "function" && typeof globalThis.MediaStream === "function"
	);
}

/**
 * Closes the graph once; a closed context rejecting or throwing is not news.
 * @param context The context to close.
 */
function closeContext(context: AudioContext): void {
	try {
		void context.close().catch(() => undefined);
	} catch {
		// Browser cleanup is best effort; local resource release must continue.
	}
}

/**
 * The one Web Audio meter: a MediaStreamAudioSourceNode into an AnalyserNode,
 * never connected to the destination, so it plays nothing a second time.
 * @param playback The model's remote playback stream.
 * @returns The meter, or null when the stream is not a MediaStream or Web Audio is absent.
 */
function createWebAudioOutputMeter(playback: VoiceOutputPlayback): VoiceOutputMeter | null {
	if (!webAudioSupported() || !(playback instanceof MediaStream)) {
		return null;
	}
	const context = new AudioContext();
	const source = context.createMediaStreamSource(playback);
	const analyser = context.createAnalyser();
	source.connect(analyser);
	const samples = new Uint8Array(analyser.fftSize);
	let closed = false;
	return Object.freeze({
		/**
		 * The context state.
		 * @returns Running, suspended or closed.
		 */
		playback: () => playbackState(context.state),
		/**
		 * Resumes the context.
		 * @returns Resolves once the browser answered.
		 */
		resume: () => context.resume(),
		/**
		 * Reads one frame.
		 * @returns The RMS level.
		 */
		read: () => {
			analyser.getByteTimeDomainData(samples);
			return rootMeanSquareLevel(samples);
		},
		/**
		 * Disconnects the nodes and closes the context once.
		 */
		close: () => {
			if (closed) {
				return;
			}
			closed = true;
			source.disconnect();
			analyser.disconnect();
			closeContext(context);
		},
	});
}

export {
	createWebAudioOutputMeter,
	rootMeanSquareLevel,
	webAudioSupported,
	type VoiceOutputMeter,
	type VoiceOutputMeterFactory,
	type VoiceOutputPlayback,
	type VoiceOutputPlaybackState,
};
