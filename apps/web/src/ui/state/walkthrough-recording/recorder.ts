// One recording of one walkthrough, in the page that makes it (TASK-304).
//
// The page was opened on one board to record one of its walkthroughs. Until
// it is started it only says whether it could be: the pane showing that board,
// drawn, and an agent that can start voice. Started from a user gesture, it
// listens (`talk-capture.ts`), asks for voice as a recording, and from then on
// one tick asks the pacing what to do and does it: begin the talk once the
// voice is live, move the pane to each step, end the talk after the last, or
// stop and keep nothing. What the voice says and what the pane draws are
// stamped as they happen. The recorder outside the page reads the state and
// takes the talk; this owns nothing else (TASK-381).

import { RECORDING_MS } from "@archboard/timing";
import type { publishRecordingPage, recordingAskedOf } from "@archboard/walkthrough/recording";
import { TALK_SAMPLE_RATE } from "@archboard/walkthrough/talk";
import type { BrowserAudioElementPort } from "@archboard/codex-realtime-voice/controllers";
import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";
import { type SemanticBoardStageProps } from "#ui/components/semantic-board-canvas/SemanticBoardStage.tsx";

import {
	pace,
	type PaceAction,
	type PaceState,
	type PanePlace,
} from "#ui/rules/walkthrough-recording/pacing.ts";
import { TalkCapture } from "#ui/clients/walkthrough-recording/talk-capture.ts";
import { recordingAudioElements } from "#ui/clients/walkthrough-recording/voice-audio.ts";
import {
	agentReadiness,
	readVoice,
	type RecordingSources,
	type RecordingTransport,
} from "#ui/rules/walkthrough-recording/voice-sources.ts";

/** The page's side of the recording contract, as it is published. */
type RecordingPage = Parameters<typeof publishRecordingPage>[0];
/** What the page says about its recording. */
type RecordingState = ReturnType<RecordingPage["state"]>;
/** The log of a finished talk, stamped on its voice's samples. */
type TalkLog = NonNullable<ReturnType<RecordingPage["talk"]>>;

/** What the page address asks the existing recorder to capture. */
type RecordingRequest = NonNullable<ReturnType<typeof recordingAskedOf>> & {
	readonly board: string | null;
};
type RecordedModel = Parameters<NonNullable<RecordingPage["load"]>>[0];
type RecordedView = {
	readonly step: RecordedStep | null;
	readonly architecture: RecordedModel | null | undefined;
};

/** A step the page moves its pane to: its own choice, answering no request. */
type RecordedStep = NonNullable<SemanticBoardStageProps["driven"]>;

/**
 * The step a recording moves its pane to, as the live recording and its rendering both ask for it.
 * @param walkthrough The walkthrough, by id.
 * @param beat The step, counted from nought.
 * @returns The step.
 */
function recordedStep(walkthrough: string, beat: number): RecordedStep {
	return { request: `record:${beat}`, walkthrough, beat, answers: false };
}

/** Whether a page that has not started could start, or why not. */
interface Readiness {
	readonly phase: RecordingState["phase"];
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
function placeIn(reading: PaneReading | null, walkthrough: string): PanePlace | null {
	const presented = reading?.presentation ?? null;
	if (presented === null || presented.walkthrough !== walkthrough) return null;
	return { beat: presented.beat, of: presented.of, arrived: presented.arrived };
}

/**
 * Whether a pane is showing a board, drawn.
 * @param reading What the pane last said it is reading, or null.
 * @param board The board, by name.
 * @returns True once it is.
 */
function drawnOn(reading: PaneReading | null, board: string | null): boolean {
	return (
		reading?.board != null &&
		reading.version !== null &&
		board !== null &&
		sameBoardName(reading.board.name, board)
	);
}

/**
 * Require both source and target guards from the captured canonical picture.
 * @param reading The last complete pane report.
 * @param model The loaded immutable capture, or null before load.
 * @returns Whether the requested picture is drawn.
 */
function canonicalDrawn(reading: PaneReading | null, model: RecordedModel | null): boolean {
	return (
		model !== null &&
		reading?.architecture?.model === model.manifest.id &&
		reading.architecture.expectedRevision === model.revision.digest &&
		reading.architecture.expectedSourceRevision === model.playback!.sourceRevision.digest
	);
}

/**
 * Match the reported picture through its existing identity contract.
 * @param reading The last pane report.
 * @param request The requested recording address.
 * @param view The loaded model and driven step.
 * @returns Whether the recording can use this picture.
 */
function requestedPicture(
	reading: PaneReading | null,
	request: RecordingRequest,
	view: RecordedView,
): boolean {
	return view.architecture === undefined
		? drawnOn(reading, request.board)
		: canonicalDrawn(reading, view.architecture);
}

/**
 * Name either form of the existing recording request.
 * @param request The page address.
 * @returns Its target name or null when none was requested.
 */
function recordingTarget(request: RecordingRequest): string | null {
	return request.canonical?.model ?? request.board;
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
	#reading: PaneReading | null = null;
	#voice: MediaStream | null = null;
	#capture: TalkCapture | null = null;
	#talk: PaceState | null = null;
	#kept: { readonly voice: Blob; readonly log: TalkLog } | null = null;
	#failure: string | null = null;
	#view: RecordedView;
	#timer: ReturnType<typeof setInterval> | null = null;
	/** The transport whose transcript the talk follows, and how to stop following it. */
	#following: { readonly transport: object; readonly stop: () => void } | null = null;

	/**
	 * A recorder for one page, idle until started.
	 * @param request What the page was opened to record.
	 */
	constructor(request: RecordingRequest) {
		this.#request = request;
		this.#view = { step: null, architecture: request.canonical === undefined ? undefined : null };
		this.page = Object.freeze({
			load: this.load.bind(this),
			state: this.state.bind(this),
			start: this.start.bind(this),
			voice: this.voice.bind(this),
			talk: this.talk.bind(this),
		});
		this.audioElements = recordingAudioElements(this.#hear.bind(this));
	}

	/**
	 * The agent and the voice as they are now; bound every render.
	 * @param sources The sources.
	 */
	bind(sources: RecordingSources): void {
		this.#sources = sources;
		this.#follow(sources.voice?.transport ?? null);
	}

	/**
	 * What the recorded pane says it is reading, whenever that changes.
	 * @param reading The reading.
	 */
	readonly reading = (reading: PaneReading): void => {
		this.#reading = reading;
		if (!requestedPicture(reading, this.#request, this.#view)) return;
		const model = this.#view.architecture;
		if (model === undefined) this.#capture?.drawn(reading.version!);
		else if (model !== null) this.#capture?.drawn(0, model.revision.digest);
	};

	/**
	 * The captured architecture and driven position, stable between updates.
	 * @returns The recording view.
	 */
	readonly view = (): RecordedView => this.#view;

	/**
	 * Load one exact canonical payload through the shared recording contract.
	 * @param input The architecture that the driver already captured.
	 * @returns Completion after the pane can consume that capture.
	 */
	load(input: RecordedModel): Promise<void> {
		const target = this.#request.canonical;
		if (target === undefined)
			throw new Error("This recording page does not request a canonical model.");
		if (this.#view.architecture !== null)
			throw new Error("This recording page already has a capture. Reopen it to record another.");
		const model = input;
		if (
			model.manifest.id !== target.model ||
			model.checkpoint!.id !== target.checkpoint ||
			model.playback!.walkthrough.id !== this.#request.walkthrough
		)
			throw new Error(
				"The capture does not match this recording address. Reopen the requested recording.",
			);
		this.#view = { ...this.#view, architecture: model };
		this.#changed();
		return Promise.resolve();
	}

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
		const presented = this.#reading?.presentation ?? null;
		const of = presented === null ? null : presented.of;
		const readiness = this.#readiness();
		const kept = this.#kept;
		return {
			phase: readiness.phase,
			walkthrough: this.#request.walkthrough,
			step: stepOf(this.#talk, of),
			of,
			failure: readiness.failure,
			durationMs: kept === null ? null : (kept.log.samples * 1000) / TALK_SAMPLE_RATE,
		};
	}

	/**
	 * Start recording: listen, then ask for voice. Called from a user gesture.
	 * @returns When the page listens.
	 * @throws {Error} When the page is not ready, or its audio could not start.
	 */
	async start(): Promise<void> {
		const sources = this.#startable();
		try {
			this.#capture = await TalkCapture.open();
			// The board is drawn already, and the talk begins on that picture.
			if (this.#reading !== null) this.reading(this.#reading);
		} catch (error) {
			this.#failure = `The page could not listen to the voice: ${words(error)}`;
			throw new Error(this.#failure, { cause: error });
		}
		this.#hearAll();
		this.#talk = { kind: "starting", since: performance.now() };
		const { walkthrough, language, against } = this.#request;
		sources.setup.talk({
			walkthrough,
			recording: { language, ...(against === null ? {} : { against }) },
		});
		this.#timer = setInterval(this.#tick.bind(this), RECORDING_MS.paceTick);
	}

	/**
	 * The finished talk's voice.
	 * @returns A 16-bit mono WAV file, or null before the state says the talk is finished.
	 */
	voice(): Blob | null {
		return this.#kept === null ? null : this.#kept.voice;
	}

	/**
	 * The finished talk's log.
	 * @returns The log, or null before the state says the talk is finished.
	 */
	talk(): TalkLog | null {
		return this.#kept === null ? null : this.#kept.log;
	}

	/** Stop everything: the page is going. */
	dispose(): void {
		this.#halt();
		this.#following?.stop();
		this.#following = null;
		this.#capture?.close();
	}

	/**
	 * Where the recording stands before anything settles it, and whether it could start.
	 * @returns The phase and any failure.
	 */
	#readiness(): Readiness {
		if (this.#failure !== null) return { phase: "failed", failure: this.#failure };
		if (this.#kept !== null) return { phase: "finished", failure: null };
		if (this.#talk !== null) return { phase: "recording", failure: null };
		return this.#couldStart();
	}

	/**
	 * Whether the page could start now: the board drawn and an agent that can start voice.
	 * @returns Ready, loading, or failed with why.
	 */
	#couldStart(): Readiness {
		if (recordingTarget(this.#request) === null) {
			return { phase: "failed", failure: "The page was opened without a recording target." };
		}
		if (this.#sources === null) return LOADING;
		const agent = agentReadiness(this.#sources.setup);
		if (agent.kind === "refused") return { phase: "failed", failure: agent.reason };
		return agent.kind === "ready" && requestedPicture(this.#reading, this.#request, this.#view)
			? READY
			: LOADING;
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
	 * The voice began playing: it goes into the talk.
	 * @param stream The voice.
	 */
	#hear(stream: MediaStream): void {
		this.#voice = stream;
		this.#hearAll();
	}

	/** Mix the voice into the talk, once both exist. */
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
			place: placeIn(this.#reading, this.#request.walkthrough),
		});
		this.#talk = turn.state;
		this.#act(turn.action);
	}

	/**
	 * Follow what the voice says on a transport, stamping each change into the talk as it arrives.
	 * @param transport The pane's transport, or null while it has none.
	 */
	#follow(transport: RecordingTransport | null): void {
		if (this.#following?.transport === transport) return;
		this.#following?.stop();
		this.#following = null;
		if (transport === null) return;
		/** Stamp what the voice says now. */
		const heard = (): void => {
			this.#capture?.said(transport.state().snapshot?.voice.transcript ?? []);
		};
		this.#following = { transport, stop: transport.subscribe(heard) };
		heard();
	}

	/**
	 * Do what the pacing said.
	 * @param action The action.
	 */
	#act(action: PaceAction): void {
		switch (action.kind) {
			case "begin":
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
		this.#view = { ...this.#view, step: recordedStep(this.#request.walkthrough, beat) };
		this.#capture?.step(beat);
		this.#changed();
	}

	/** Notify subscribers after a capture or position changes. */
	#changed(): void {
		for (const listener of this.#listeners) listener();
	}

	/**
	 * The talk is over: keep it, then let voice go.
	 * @returns When the talk is kept, or the recording failed.
	 */
	async #finish(): Promise<void> {
		this.#halt();
		const capture = this.#capture;
		if (capture === null) return;
		try {
			this.#kept = await capture.finish();
			this.#stopVoice();
		} catch (error) {
			this.#fail(`The talk could not be kept: ${words(error)}`);
		}
	}

	/**
	 * End the recording, keeping nothing.
	 * @param reason Why.
	 */
	#fail(reason: string): void {
		this.#halt();
		this.#failure ??= reason;
		this.#capture?.close();
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

export { WalkthroughRecorder, recordedStep, type RecordedStep, type RecordingRequest };
