// Where a talk stands at each frame of its rendering: the step on screen, what
// the voice has said (TASK-381) and how loud the voice is (TASK-400).
//
// An event shows on the first frame at or after the moment it happened, so a
// step or a word is never more than one frame late and never early. The page
// plays the talk forward one frame at a time and reads the moment it reached;
// nothing here knows about the clock or the page. How loud the voice is changes
// on nearly every frame, so it is not part of the moment: it is read where it is
// drawn, as the shell reads the level of a live voice.

import { SAMPLES_PER_FRAME, type Talk } from "@archboard/walkthrough/talk";
import type { SubtitleSource, VoiceLevel } from "@archboard/workbench/voice";
import { recordedStep, type RecordedStep } from "#ui/state/walkthrough-recording/recorder.ts";

/** Something that happened during the talk, at a moment of it. */
type TalkEvent = Talk["events"][number];

/** Where a talk stands at one frame. */
interface TalkMoment {
	/** The step on screen, or null before the first. */
	readonly step: RecordedStep | null;
	/** What the voice has said, oldest utterance first. */
	readonly transcript: readonly SubtitleSource[];
}

/** Before anything happened. */
const OPENING: TalkMoment = Object.freeze({ step: null, transcript: Object.freeze([]) });

/**
 * The frame an event first shows on.
 * @param at When it happened, in samples.
 * @returns The frame, counted from nought.
 */
function frameOf(at: number): number {
	return Math.ceil(at / SAMPLES_PER_FRAME);
}

/**
 * A transcript with one utterance as it now reads, in its place when it was already there.
 * @param transcript The transcript.
 * @param said The utterance.
 * @returns The transcript after it.
 */
function withUtterance(
	transcript: readonly SubtitleSource[],
	said: Extract<TalkEvent, { kind: "said" }>,
): readonly SubtitleSource[] {
	const entry: SubtitleSource = {
		itemId: said.itemId,
		speaker: "assistant",
		text: said.text,
		final: said.final,
	};
	const index = transcript.findIndex((line) => line.itemId === said.itemId);
	return index === -1 ? [...transcript, entry] : transcript.with(index, entry);
}

/**
 * A moment after one more event.
 * @param moment The moment.
 * @param event The event.
 * @param walkthrough The walkthrough presented, by id.
 * @returns The moment after it.
 */
function after(moment: TalkMoment, event: TalkEvent, walkthrough: string): TalkMoment {
	if (event.kind === "step") return { ...moment, step: recordedStep(walkthrough, event.beat) };
	if (event.kind === "said")
		return { ...moment, transcript: withUtterance(moment.transcript, event) };
	return moment;
}

/** A talk played forward, one frame at a time. */
class TalkPlayback {
	readonly #events: readonly TalkEvent[];
	readonly #walkthrough: string;
	readonly #levels: readonly number[];
	readonly #listeners = new Set<() => void>();
	readonly #heard = new Set<() => void>();
	#next = 0;
	#moment: TalkMoment = OPENING;
	/** The frame played to, or -1 before the first. */
	#frame = -1;

	/**
	 * A talk, played to before its first frame.
	 * @param talk The talk.
	 * @param talk.events What happened, in order.
	 * @param talk.board The board, with the walkthrough presented.
	 * @param levels How loud the voice is on each frame, from frame nought.
	 */
	constructor(
		talk: { readonly events: readonly TalkEvent[]; readonly board: Talk["board"] },
		levels: readonly number[],
	) {
		this.#events = talk.events;
		this.#walkthrough = talk.board.walkthrough.id;
		this.#levels = levels;
	}

	/** How loud the voice is on the frame played to, 0..1, and silent before the first. */
	readonly level: VoiceLevel = {
		/**
		 * The level now.
		 * @returns It.
		 */
		read: () => this.#levels[this.#frame] ?? 0,
		/**
		 * Hear it change.
		 * @param listener Called after each change.
		 * @returns Stops listening.
		 */
		subscribe: (listener) => {
			this.#heard.add(listener);
			return () => {
				this.#heard.delete(listener);
			};
		},
	};

	/**
	 * Where the talk stands.
	 * @returns The moment.
	 */
	readonly moment = (): TalkMoment => this.#moment;

	/**
	 * Hear when the moment changes.
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
	 * Play on to a frame: the voice is as loud as it was then, and every event that shows by then
	 * happens, in order.
	 * @param frame The frame, counted from nought.
	 * @returns The beat of the step on screen then, or null before the first.
	 */
	playTo(frame: number): number | null {
		this.#hearAt(frame);
		let moment = this.#moment;
		for (; this.#next < this.#events.length; this.#next += 1) {
			const event = this.#events[this.#next]!;
			if (frameOf(event.at) > frame) break;
			moment = after(moment, event, this.#walkthrough);
		}
		if (moment !== this.#moment) {
			this.#moment = moment;
			for (const listener of this.#listeners) listener();
		}
		return moment.step === null ? null : moment.step.beat;
	}

	/**
	 * Hear the voice as it was on a frame, and tell whoever listens when it is louder or quieter.
	 * @param frame The frame, counted from nought.
	 */
	#hearAt(frame: number): void {
		const was = this.level.read();
		this.#frame = frame;
		if (this.level.read() === was) return;
		for (const listener of this.#heard) listener();
	}
}

export { TalkPlayback, frameOf, type TalkMoment };
