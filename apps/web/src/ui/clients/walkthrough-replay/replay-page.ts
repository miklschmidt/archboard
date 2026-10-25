// The page that renders a talk frame by frame (TASK-381).
//
// Loading a talk points the pane's board reads at the talk, swaps every moving
// picture onto a stepped clock and mounts the recording's frame on the talk's
// board. It then plays the board's entrance through, uncaptured, so the first
// frame shows the board at rest, as the talk's first moment did.
//
// Each frame is then drawn the same way. The clock moves to the frame's time,
// running the timers due on the way. What happened by then is shown. The page
// waits until the picture for that step is drawn and nothing is changing. The
// frames the viewer asked for run. Every animation and picture clock is stood
// where the clock is. The browser draws once. Anything that moved outside the
// clock fails the frame, because a frame that depends on how fast this machine
// drew it is not the recording.

import type { QueryClient } from "@tanstack/react-query";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { RECORDING_REPLAY_PREROLL_MS } from "@archboard/timing";
import {
	ReplayOptionsSchema,
	TALK_FRAME_RATE,
	TalkSchema,
	framesOf,
	type ReplayPage,
	type Talk,
} from "@archboard/walkthrough/talk";
import { createBoardQueryClient } from "#ui/clients/board-catalog/query-client.ts";
import {
	createSteppedClock,
	driveFramesFrom,
	type SteppedClock,
} from "@archboard/ui-kit/frame-clock";
import { chooseLayoutEngine } from "#ui/clients/semantic-board-canvas/reads/layout-engine.ts";
import {
	pictureSource,
	takePicturesFrom,
} from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import { readBoardsFrom } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";
import {
	sameBoardName,
	type SemanticPaneReading,
} from "#ui/rules/semantic-board-canvas/board/address.ts";
import { ReplayStage } from "#ui/components/walkthrough-replay/ReplayStage.tsx";
import { FrameReadiness } from "#ui/clients/walkthrough-replay/frame-readiness.ts";
import { TalkPlayback } from "#ui/state/walkthrough-replay/talk-playback.ts";
import { talkReads } from "#ui/clients/walkthrough-replay/talk-reads.ts";

/** How long one frame lasts, in milliseconds. */
const FRAME_MS = 1000 / TALK_FRAME_RATE;

/** The frames before the talk's first, drawn and not captured, as whole frames. */
const PREROLL_FRAMES = Math.ceil(RECORDING_REPLAY_PREROLL_MS / FRAME_MS);

/** A talk on the page, and where its rendering has got to. */
interface Rendering {
	readonly talk: Talk;
	readonly clock: SteppedClock;
	readonly playback: TalkPlayback;
	readonly client: QueryClient;
	readonly readiness: FrameReadiness;
	/** Boards read that the talk could not answer. */
	readonly foreign: string[];
	/** What the pane last said it is reading. */
	reading: SemanticPaneReading | null;
	/** The step on screen, counted from nought, or null before the first. */
	beat: number | null;
	/** The next frame to draw. */
	next: number;
}

/**
 * Draw every picture of the page against the variant a talk was recorded with, whichever
 * variant the pane asks for: a talk read against a variant draws that comparison in every
 * frame, and no pane could have asked for it.
 * @param against The variant the talk is read against.
 */
function drawAgainst(against: string): void {
	const source = pictureSource();
	takePicturesFrom({
		...source,
		/**
		 * Draw the picture the pane asked for, read against the talk's variant.
		 * @param request What the pane asked for.
		 * @param client The page's cache.
		 * @param signal Cancels the read.
		 * @returns The drawing.
		 */
		draw: (request, client, signal) => source.draw({ ...request, against }, client, signal),
	});
}

/**
 * Whether the pane shows the talk's board as the talk drew it, or what it waits for.
 * @param rendering The rendering.
 * @returns What it waits for, in words, or null when the board is drawn.
 */
function boardPending(rendering: Rendering): string | null {
	const { reading, talk } = rendering;
	if (reading?.drawn == null || !sameBoardName(reading.board, talk.board.name)) {
		return `the pane to draw ${talk.board.name}`;
	}
	return reading.drawn.version === talk.board.version
		? null
		: `the board at version ${talk.board.version}, not ${reading.drawn.version}`;
}

/**
 * What a frame still waits for before it shows the talk's board at its step.
 * @param rendering The rendering.
 * @returns What it waits for, in words, or null when nothing.
 */
function pendingOf(rendering: Rendering): string | null {
	if (rendering.client.isFetching() > 0) return "the board's picture to be drawn";
	const board = boardPending(rendering);
	if (board !== null) return board;
	return stepPending(rendering);
}

/**
 * Whether the pane shows the talk's step, or which step it waits for.
 * @param rendering The rendering.
 * @returns The step it waits for, in words, or null when it shows the talk's.
 */
function stepPending(rendering: Rendering): string | null {
	const { beat, reading } = rendering;
	return beat === null || reading?.presentation?.beat === beat ? null : `step ${beat + 1}`;
}

/**
 * What moved outside the frame clock, or was read outside the talk, in words.
 * @param rendering The rendering.
 * @returns The violations.
 */
function violationsOf(rendering: Rendering): readonly string[] {
	const moved = rendering.clock.violations().map((violation) => violation.what);
	const read = rendering.foreign.map((board) => `The board ${board} was read, not the talk's.`);
	return [...moved, ...read];
}

/**
 * Draw one frame: the clock at its time, what happened by then, and every moving picture there.
 * @param rendering The rendering.
 * @param index The frame, counted from nought; the entrance before the talk counts below it.
 * @returns Once the browser has drawn it.
 * @throws {Error} When it was not ready in time, or something moved outside the clock.
 */
async function draw(rendering: Rendering, index: number): Promise<void> {
	const { clock, readiness } = rendering;
	clock.advanceTo(index * FRAME_MS);
	if (index >= 0) {
		flushSync(() => {
			rendering.beat = rendering.playback.playTo(index);
		});
	}
	/**
	 * What the frame still waits for.
	 * @returns It, in words, or null when nothing.
	 */
	const pending = (): string | null => pendingOf(rendering);
	await readiness.until(pending, index);
	clock.runFrame();
	await readiness.until(pending, index);
	clock.syncAnimations(document);
	await clock.paint();
	const violations = violationsOf(rendering);
	if (violations.length > 0) {
		throw new Error(`Frame ${index} cannot be rendered from the talk: ${violations.join(" ")}`);
	}
}

/** The page's side of rendering one talk. */
class WalkthroughReplay {
	/** What the recorder drives. */
	readonly page: ReplayPage;
	readonly #root: HTMLElement;
	#rendering: Rendering | null = null;

	/**
	 * A page ready to be given a talk.
	 * @param root The element the talk is mounted in.
	 */
	constructor(root: HTMLElement) {
		this.#root = root;
		this.page = Object.freeze({ load: this.load.bind(this), frame: this.frame.bind(this) });
	}

	/**
	 * Put a talk on the page and play the board's entrance through.
	 * @param value The talk, as `talk.json` holds it.
	 * @param options The theme and layout engine to render it in, and how loud its voice is on each frame.
	 * @returns How many frames it renders to.
	 * @throws {Error} When the talk cannot be read, the page already has one, or the board never draws.
	 */
	async load(value: unknown, options: unknown): Promise<{ readonly frames: number }> {
		if (this.#rendering !== null) throw new Error("This page already has a talk; open it again.");
		const talk = TalkSchema.parse(value);
		const { theme, layout, levels } = ReplayOptionsSchema.parse(options);
		document.documentElement.dataset["theme"] = theme;
		chooseLayoutEngine(layout);
		const clock = createSteppedClock(-PREROLL_FRAMES * FRAME_MS);
		driveFramesFrom(clock);
		clock.install(window);
		const rendering: Rendering = {
			talk,
			clock,
			playback: new TalkPlayback(talk, levels),
			client: createBoardQueryClient(),
			readiness: new FrameReadiness(this.#root),
			foreign: [],
			reading: null,
			beat: null,
			next: 0,
		};
		readBoardsFrom(talkReads(talk, (board) => rendering.foreign.push(board)));
		if (talk.board.against !== undefined) drawAgainst(talk.board.against);
		this.#rendering = rendering;
		createRoot(this.#root).render(
			createElement(ReplayStage, {
				talk,
				playback: rendering.playback,
				client: rendering.client,
				/**
				 * Keep what the pane says it is reading.
				 * @param reading The reading.
				 */
				onReading: (reading: SemanticPaneReading): void => {
					rendering.reading = reading;
				},
			}),
		);
		for (let index = -PREROLL_FRAMES; index < 0; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- frames are drawn in order: each stands on the clock the last one left
			await draw(rendering, index);
		}
		return { frames: framesOf(talk) };
	}

	/**
	 * Draw the next frame of the talk.
	 * @param index The frame, counted from nought, in order.
	 * @returns Once it is drawn.
	 * @throws {Error} When no talk is loaded, a frame is skipped, or the frame cannot be drawn.
	 */
	async frame(index: number): Promise<void> {
		const rendering = this.#rendering;
		if (rendering === null) throw new Error("Load a talk before drawing its frames.");
		if (index !== rendering.next) {
			throw new Error(`Frames are drawn in order: ${rendering.next} is next, not ${index}.`);
		}
		rendering.next += 1;
		await draw(rendering, index);
	}
}

export { WalkthroughReplay };
