// What a recording keeps of its talk (TASK-381): the voice, sample by sample,
// and what happened while it spoke, stamped in samples of that same audio.
//
// The voice is mixed into one bus of an audio graph running at the talk's
// sample rate, and a tap on the audio thread passes on every render quantum of
// it with the frame it began at, silence included, so the voice's samples and
// the graph's clock are one count. An event is stamped with the graph's clock
// when it happens, which is at most one render callback from the sound heard
// then, well under one frame of video. Nothing here draws or captures a
// picture: the picture is rendered from the talk afterwards, frame by frame.

import { RECORDING_MS } from "@archboard/timing";
import type { publishRecordingPage } from "@archboard/walkthrough/recording";
import { TALK_SAMPLE_RATE } from "@archboard/walkthrough/talk";

/** The log of a finished talk, as the recording page hands it over. */
type TalkLog = NonNullable<ReturnType<Parameters<typeof publishRecordingPage>[0]["talk"]>>;
/** Something that happened during the talk, at a moment of it. */
type TalkEvent = TalkLog["events"][number];

/** What the audio worklet's scope has that the DOM library does not declare. */
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare const currentFrame: number;

/** The name the tap is registered by in the audio worklet. */
const TAP = "archboard-talk-tap";

/** One render quantum of the voice, from the frame it began at. */
interface Block {
	readonly frame: number;
	readonly pcm: Int16Array;
}

/** An event as it happens, before the clock stamps it. */
type Unstamped = {
	[Kind in TalkEvent["kind"]]: Omit<Extract<TalkEvent, { kind: Kind }>, "at">;
}[Exclude<TalkEvent["kind"], "end">];

/** One line of the voice's transcript, as far as a talk keeps it. */
interface SaidLine {
	readonly itemId: string;
	readonly speaker: string;
	readonly text: string;
	readonly final: boolean;
}

/**
 * The tap, run in the audio worklet's own scope, where it is sent as source text: it may use
 * nothing from this module. Each render quantum it passes the voice on as 16-bit samples,
 * silence when nothing is heard.
 * @param name The name to register it by.
 */
function installTap(name: string): void {
	/** Passes each render quantum on. */
	class TalkTap extends AudioWorkletProcessor {
		/**
		 * Pass one render quantum on.
		 * @param inputs The node's inputs.
		 * @returns True, to keep running.
		 */
		process(inputs: readonly (readonly Float32Array[])[]): boolean {
			// Nothing heard is a render quantum of silence, which still counts.
			const samples = inputs[0]?.[0] ?? new Float32Array(128);
			const pcm = new Int16Array(samples.length);
			for (let index = 0; index < samples.length; index += 1) {
				pcm[index] = Math.round(Math.max(-1, Math.min(1, samples[index] ?? 0)) * 32_767);
			}
			this.port.postMessage({ frame: currentFrame, pcm }, [pcm.buffer]);
			return true;
		}
	}
	registerProcessor(name, TalkTap);
}

/**
 * The tap's module, as a URL the audio worklet can load.
 * @returns The URL.
 */
function tapModule(): string {
	const source = `(${installTap.toString()})(${JSON.stringify(TAP)});`;
	return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

/**
 * A WAV file of 16-bit mono samples at the talk's rate.
 * @param samples The samples.
 * @returns The file.
 */
function wavOf(samples: Int16Array): Blob {
	const header = new DataView(new ArrayBuffer(44));
	/**
	 * Write a four-letter tag into the header.
	 * @param at Where.
	 * @param text The tag.
	 */
	function ascii(at: number, text: string): void {
		for (let index = 0; index < text.length; index += 1) {
			header.setUint8(at + index, text.charCodeAt(index));
		}
	}
	const bytes = samples.length * 2;
	ascii(0, "RIFF");
	header.setUint32(4, 36 + bytes, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	header.setUint32(16, 16, true);
	header.setUint16(20, 1, true);
	header.setUint16(22, 1, true);
	header.setUint32(24, TALK_SAMPLE_RATE, true);
	header.setUint32(28, TALK_SAMPLE_RATE * 2, true);
	header.setUint16(32, 2, true);
	header.setUint16(34, 16, true);
	ascii(36, "data");
	header.setUint32(40, bytes, true);
	const body = new DataView(new ArrayBuffer(bytes));
	for (let index = 0; index < samples.length; index += 1) {
		body.setInt16(index * 2, samples[index] ?? 0, true);
	}
	return new Blob([header.buffer, body.buffer], { type: "audio/wav" });
}

/**
 * One turn of the browser's event loop.
 * @returns Once it has turned.
 */
async function turn(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

/** A talk being kept, from the voice's first word to the end of its last step. */
class TalkCapture {
	readonly #context: AudioContext;
	readonly #bus: GainNode;
	readonly #blocks: Block[] = [];
	readonly #heard = new Set<string>();
	readonly #events: TalkEvent[] = [];
	/** What was last stamped of each line, by its id. */
	readonly #said = new Map<string, string>();
	#lines: readonly SaidLine[] = [];
	#drawn: number | null = null;
	#origin: number | null = null;
	/** Whether the talk has ended, after which nothing more is stamped. */
	#ended = false;

	/**
	 * A capture over a running audio graph.
	 * @param context The graph.
	 * @param bus Where the voice is mixed in.
	 */
	private constructor(context: AudioContext, bus: GainNode) {
		this.#context = context;
		this.#bus = bus;
	}

	/**
	 * Start listening: an audio graph at the talk's rate whose tap keeps every quantum from now.
	 * Called from a user gesture, which lets the graph run.
	 * @returns The capture.
	 */
	static async open(): Promise<TalkCapture> {
		const context = new AudioContext({ sampleRate: TALK_SAMPLE_RATE });
		const module = tapModule();
		try {
			await context.audioWorklet.addModule(module);
		} finally {
			URL.revokeObjectURL(module);
		}
		const tap = new AudioWorkletNode(context, TAP, {
			channelCount: 1,
			channelCountMode: "explicit",
			channelInterpretation: "speakers",
		});
		const bus = context.createGain();
		// Nobody hears the recording: the tap's output goes nowhere audible, but it goes somewhere,
		// so the graph keeps pulling the tap while nothing is said.
		const silent = context.createGain();
		silent.gain.value = 0;
		bus.connect(tap).connect(silent).connect(context.destination);
		const capture = new TalkCapture(context, bus);
		tap.port.addEventListener("message", (event: MessageEvent<Block>) => {
			capture.#blocks.push(event.data);
		});
		tap.port.start();
		await context.resume();
		return capture;
	}

	/**
	 * Mix a voice in, once.
	 * @param stream The voice.
	 */
	hear(stream: MediaStream): void {
		if (this.#heard.has(stream.id) || stream.getAudioTracks().length === 0) return;
		this.#context.createMediaStreamSource(stream).connect(this.#bus);
		this.#heard.add(stream.id);
	}

	/** The talk begins now: this is sample nought, with the board and what was said so far. */
	begin(): void {
		if (this.#origin !== null) return;
		this.#origin = this.#now();
		if (this.#drawn !== null) this.#stamp({ kind: "drawn", version: this.#drawn });
		this.#stampSaid();
	}

	/**
	 * A step was shown.
	 * @param beat The step, counted from nought.
	 */
	step(beat: number): void {
		this.#stamp({ kind: "step", beat });
	}

	/**
	 * What the voice has said, whenever it changes.
	 * @param lines The transcript, oldest first.
	 */
	said(lines: readonly SaidLine[]): void {
		this.#lines = lines;
		this.#stampSaid();
	}

	/**
	 * The pane drew the board, at a version.
	 * @param version The version.
	 */
	drawn(version: number): void {
		if (version === this.#drawn) return;
		this.#drawn = version;
		this.#stamp({ kind: "drawn", version });
	}

	/**
	 * The talk is over: stamp its end, and hand over the voice and the log.
	 * @returns The voice as a WAV file, and the log.
	 */
	async finish(): Promise<{ readonly voice: Blob; readonly log: TalkLog }> {
		const origin = this.#origin ?? this.#now();
		const end = Math.max(1, this.#now() - origin);
		this.#ended = true;
		this.#events.push({ kind: "end", at: end });
		await this.#drained(origin + end);
		const samples = this.#samples(origin, end);
		this.close();
		return {
			voice: wavOf(samples),
			log: {
				samples: end,
				baseLatencyMs: this.#context.baseLatency * 1000,
				events: [...this.#events],
			},
		};
	}

	/** Stop listening, keeping nothing more. */
	close(): void {
		if (this.#context.state !== "closed") void this.#context.close();
	}

	/**
	 * The graph's clock.
	 * @returns Its frame now, in samples.
	 */
	#now(): number {
		return Math.round(this.#context.currentTime * TALK_SAMPLE_RATE);
	}

	/**
	 * Stamp an event with the graph's clock, once the talk has begun.
	 * @param event The event, without its moment.
	 */
	#stamp(event: Unstamped): void {
		if (this.#origin === null || this.#ended) return;
		this.#events.push({ ...event, at: this.#now() - this.#origin });
	}

	/** Stamp each line of the voice's that reads other than it did. */
	#stampSaid(): void {
		if (this.#origin === null || this.#ended) return;
		for (const line of this.#lines) {
			if (line.speaker === "assistant") this.#stampLine(line);
		}
	}

	/**
	 * Stamp one line of the voice's, when it reads other than it did.
	 * @param line The line.
	 */
	#stampLine(line: SaidLine): void {
		const reads = `${line.final ? "final" : "partial"}:${line.text}`;
		if (this.#said.get(line.itemId) === reads) return;
		this.#said.set(line.itemId, reads);
		this.#stamp({ kind: "said", itemId: line.itemId, text: line.text, final: line.final });
	}

	/**
	 * Wait until the tap has passed on every quantum up to a frame.
	 * @param until The frame.
	 * @returns Once it has, or once waiting longer would not help.
	 */
	async #drained(until: number): Promise<void> {
		const deadline = performance.now() + RECORDING_MS.tapDrain;
		while (performance.now() < deadline) {
			const last = this.#blocks.at(-1);
			if (last !== undefined && last.frame + last.pcm.length >= until) return;
			// oxlint-disable-next-line no-await-in-loop -- the tap's messages arrive between turns
			await turn();
		}
	}

	/**
	 * The voice's samples of the talk.
	 * @param origin The talk's first frame.
	 * @param length How many samples.
	 * @returns The samples, silence where the tap passed nothing on.
	 */
	#samples(origin: number, length: number): Int16Array {
		const samples = new Int16Array(length);
		for (const { frame, pcm } of this.#blocks) {
			const from = Math.max(0, origin - frame);
			const to = Math.min(pcm.length, origin + length - frame);
			if (to > from) samples.set(pcm.subarray(from, to), frame + from - origin);
		}
		return samples;
	}
}

export { TalkCapture, type SaidLine };
