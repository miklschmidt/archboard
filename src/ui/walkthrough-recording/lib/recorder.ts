// One recording of one walkthrough, in the page that makes it (TASK-304).
//
// The page was opened on one board to record one of its walkthroughs. Until
// it is started it only says whether it could be: the pane showing that board,
// drawn, and an agent that can start voice. Started from a user gesture, it
// captures its tab, asks for voice as a recording, and from then on one tick
// asks the pacing what to do and does it: begin writing once the voice is
// live, move the pane to each step, finish the file after the last, or stop
// and keep nothing. The recorder outside the page reads the state and takes
// the file; this owns nothing else.

import { RECORDING_PACE_TICK_MS } from "@/shared/timing/timing";
import {
	RecordingStartSchema,
	type RecordingPage,
	type RecordingPhase,
	type RecordingStart,
	type RecordingState,
} from "@/shared/walkthrough-recording";
import type { BrowserAudioElementPort } from "@/ui/codex-workbench-media";
import {
	sameBoardName,
	type SemanticBoardStageProps,
	type SemanticPaneReading,
} from "@/ui/semantic-board-canvas";

import {
	pace,
	type PaceAction,
	type PaceState,
	type PanePlace,
} from "@/ui/walkthrough-recording/lib/pacing";
import {
	captureTab,
	type CapturedFile,
	type TabCapture,
} from "@/ui/walkthrough-recording/lib/tab-capture";
import { rehearse } from "@/ui/walkthrough-recording/lib/rehearsal";
import { recordingAudioElements } from "@/ui/walkthrough-recording/lib/voice-audio";
import {
	agentReadiness,
	readVoice,
	type RecordingSources,
} from "@/ui/walkthrough-recording/lib/voice-sources";

/** What the page was opened to record. */
interface RecordingRequest {
	/** The board, by name, or null when the address named none. */
	readonly board: string | null;
	/** The walkthrough, by id. */
	readonly walkthrough: string;
	/** The language the voice narrates it in, as a BCP 47 tag. */
	readonly language: string;
}

/** A step the page moves its pane to: its own choice, answering no request. */
type RecordedStep = NonNullable<SemanticBoardStageProps["driven"]>;

/** Whether a page that has not started could start, or why not. */
interface Readiness {
	readonly phase: RecordingPhase;
	readonly failure: string | null;
}

const READY: Readiness = Object.freeze({ phase: "ready", failure: null });
const LOADING: Readiness = Object.freeze({ phase: "loading", failure: null });

/**
 * Where the pane is in the recorded walkthrough.
 * @param reading What the pane last said it is reading, or null.
 * @param walkthrough The recorded walkthrough's id.
 * @returns Its place, or null while it is not presenting that walkthrough.
 */
function placeIn(reading: SemanticPaneReading | null, walkthrough: string): PanePlace | null {
	const presented = reading === null ? null : reading.presentation;
	if (presented === null || presented.walkthrough !== walkthrough) return null;
	return { beat: presented.beat, of: presented.of, arrived: presented.arrived };
}

/**
 * Whether a pane is showing a board, drawn.
 * @param reading What the pane last said it is reading, or null.
 * @param board The board, by name.
 * @returns True once it is.
 */
function drawnOn(reading: SemanticPaneReading | null, board: string): boolean {
	return reading !== null && reading.drawn !== null && sameBoardName(reading.board, board);
}

/**
 * Words for anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function words(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The step on screen, counted from one, as the talk has it.
 * @param talk Where the talk is, or null before it began.
 * @param of How many steps there are, when known.
 * @returns The step, or null before the first.
 */
function stepOf(talk: PaceState | null, of: number | null): number | null {
	if (talk === null) return null;
	if (talk.kind === "step") return talk.beat + 1;
	return talk.kind === "tail" || talk.kind === "done" ? of : null;
}

/** One recording, as the application wires it. */
class WalkthroughRecorder {
	/** The page's side of the recorder's contract. */
	readonly page: RecordingPage;
	/** Where each pane's media owner makes its audio elements: here, heard by the recording. */
	readonly audioElements: BrowserAudioElementPort;
	readonly #request: RecordingRequest;
	readonly #listeners = new Set<() => void>();
	#sources: RecordingSources | null = null;
	#reading: SemanticPaneReading | null = null;
	#voice: MediaStream | null = null;
	#capture: TabCapture | null = null;
	#talk: PaceState | null = null;
	#file: CapturedFile | null = null;
	#failure: string | null = null;
	#step: RecordedStep | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	/** The page's size when the tab was captured, which the file is written at. */
	#frame: { readonly width: number; readonly height: number } | null = null;

	/**
	 * A recorder for one page, idle until started.
	 * @param request What the page was opened to record.
	 */
	constructor(request: RecordingRequest) {
		this.#request = request;
		this.page = Object.freeze({
			state: this.state.bind(this),
			start: this.start.bind(this),
			file: this.file.bind(this),
		});
		this.audioElements = recordingAudioElements(this.#hear.bind(this));
	}

	/**
	 * The agent and the voice as they are now; bound every render.
	 * @param sources The sources.
	 */
	bind(sources: RecordingSources): void {
		this.#sources = sources;
	}

	/**
	 * What the recorded pane says it is reading, whenever that changes.
	 * @param reading The reading.
	 */
	readonly reading = (reading: SemanticPaneReading): void => {
		this.#reading = reading;
	};

	/**
	 * The step the pane is to show.
	 * @returns The step, or null before the first.
	 */
	readonly step = (): RecordedStep | null => this.#step;

	/**
	 * Hear when the step changes.
	 * @param listener Called after each change.
	 * @returns Stops listening.
	 */
	readonly subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	};

	/**
	 * Where the recording stands.
	 * @returns The state.
	 */
	state(): RecordingState {
		const presented = this.#reading === null ? null : this.#reading.presentation;
		const of = presented === null ? null : presented.of;
		const readiness = this.#readiness();
		const file = this.#file;
		return {
			phase: readiness.phase,
			walkthrough: this.#request.walkthrough,
			step: stepOf(this.#talk, of),
			of,
			failure: readiness.failure,
			mimeType: file === null ? null : file.mimeType,
			durationMs: file === null ? null : file.durationMs,
		};
	}

	/**
	 * Start recording: draw what the talk draws later once, capture the tab, then ask for voice.
	 * Called from a user gesture.
	 * @param options The container to write.
	 * @returns When capture has begun.
	 * @throws {Error} When the page is not ready, or the tab could not be captured.
	 */
	async start(options: RecordingStart): Promise<void> {
		const { container } = RecordingStartSchema.parse(options);
		const sources = this.#startable();
		this.#frame = { width: window.innerWidth, height: window.innerHeight };
		await rehearse();
		try {
			this.#capture = await captureTab(container);
		} catch (error) {
			this.#failure = `The tab could not be captured: ${words(error)}`;
			throw new Error(this.#failure, { cause: error });
		}
		this.#hearAll();
		this.#talk = { kind: "starting", since: performance.now() };
		const { walkthrough, language } = this.#request;
		sources.setup.talk({ walkthrough, recording: { language } });
		this.#timer = setInterval(this.#tick.bind(this), RECORDING_PACE_TICK_MS);
	}

	/**
	 * The finished recording.
	 * @returns The file, or null before the state says it is finished.
	 */
	file(): Blob | null {
		return this.#file === null ? null : this.#file.blob;
	}

	/** Stop everything: the page is going. */
	dispose(): void {
		this.#halt();
		if (this.#file === null && this.#failure === null) this.#capture?.discard();
	}

	/**
	 * Where the recording stands before anything settles it, and whether it could start.
	 * @returns The phase and any failure.
	 */
	#readiness(): Readiness {
		if (this.#failure !== null) return { phase: "failed", failure: this.#failure };
		if (this.#file !== null) return { phase: "finished", failure: null };
		if (this.#talk !== null) return { phase: "recording", failure: null };
		return this.#couldStart();
	}

	/**
	 * Whether the page could start now: the board drawn and an agent that can start voice.
	 * @returns Ready, loading, or failed with why.
	 */
	#couldStart(): Readiness {
		const { board } = this.#request;
		if (board === null) {
			return { phase: "failed", failure: "The page was opened to record without a board." };
		}
		if (this.#sources === null) return LOADING;
		const agent = agentReadiness(this.#sources.setup);
		if (agent.kind === "refused") return { phase: "failed", failure: agent.reason };
		return agent.kind === "ready" && drawnOn(this.#reading, board) ? READY : LOADING;
	}

	/**
	 * The sources a start speaks through, refused unless the page is ready.
	 * @returns The sources.
	 * @throws {Error} When the page is not ready to record.
	 */
	#startable(): RecordingSources {
		const readiness = this.#readiness();
		if (readiness.phase !== "ready" || this.#sources === null) {
			throw new Error(readiness.failure ?? `The page is ${readiness.phase}, not ready to record.`);
		}
		return this.#sources;
	}

	/**
	 * The voice began playing: it goes into the file.
	 * @param stream The voice.
	 */
	#hear(stream: MediaStream): void {
		this.#voice = stream;
		this.#hearAll();
	}

	/** Mix the voice into the capture, once both exist. */
	#hearAll(): void {
		if (this.#voice !== null) this.#capture?.hear(this.#voice);
	}

	/** One tick: ask the pacing, and do what it says. */
	#tick(): void {
		const talk = this.#talk;
		const sources = this.#sources;
		if (talk === null || sources === null) return;
		const turn = pace(talk, {
			now: performance.now(),
			...readVoice(sources),
			framed: this.#framed(),
			place: placeIn(this.#reading, this.#request.walkthrough),
		});
		this.#talk = turn.state;
		this.#act(turn.action);
	}

	/**
	 * Whether the page is the size its tab was captured at.
	 * @returns True when it is.
	 */
	#framed(): boolean {
		const frame = this.#frame;
		return frame?.width === window.innerWidth && frame.height === window.innerHeight;
	}

	/**
	 * Do what the pacing said.
	 * @param action The action.
	 */
	#act(action: PaceAction): void {
		switch (action.kind) {
			case "capture":
				this.#capture?.begin();
				break;
			case "show":
				this.#show(action.beat);
				break;
			case "finish":
				void this.#finish();
				break;
			case "fail":
				this.#fail(action.reason);
				break;
		}
	}

	/**
	 * Move the pane to a step.
	 * @param beat The step, counted from zero.
	 */
	#show(beat: number): void {
		const { walkthrough } = this.#request;
		this.#step = { request: `record:${beat}`, walkthrough, beat, answers: false };
		for (const listener of this.#listeners) listener();
	}

	/**
	 * The talk is over: finish the file, then let voice go.
	 * @returns When the file is finished, or the recording failed.
	 */
	async #finish(): Promise<void> {
		this.#halt();
		const capture = this.#capture;
		if (capture === null) return;
		try {
			this.#file = await capture.finish();
			this.#stopVoice();
		} catch (error) {
			this.#fail(`The recording could not be finished: ${words(error)}`);
		}
	}

	/**
	 * End the recording, keeping nothing.
	 * @param reason Why.
	 */
	#fail(reason: string): void {
		this.#halt();
		this.#failure ??= reason;
		this.#capture?.discard();
		this.#stopVoice();
	}

	/** Let voice go: the recording no longer needs it. */
	#stopVoice(): void {
		void this.#sources?.voice?.session.stop().catch(() => undefined);
	}

	/** Stop the tick. */
	#halt(): void {
		if (this.#timer !== null) clearInterval(this.#timer);
		this.#timer = null;
	}
}

export { WalkthroughRecorder, type RecordedStep, type RecordingRequest };
