// What the model's output level draws again (TASK-385.03): the level changes on
// every frame while the model speaks, and the Talk control says only whether it
// is speaking. So the control is drawn again when the output crosses the
// speaking level, and not for the frames in between.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, render } from "@testing-library/react";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Profiler } from "react";

import { VOICE_OUTPUT_SPEAKING_LEVEL } from "@/ui/voice-output-level";
import { TalkControl } from "@/ui/workbench";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** Nothing happens: the test presses nothing. */
function nothing(): void {
	// No control is used here.
}

/** Actions that do nothing, for a control nobody presses. */
const IDLE_ACTIONS: AgentActions = {
	send: nothing,
	talk: nothing,
	mute: nothing,
	unmute: nothing,
	endVoice: nothing,
	stop: nothing,
	signIn: nothing,
	cancelSignIn: nothing,
	signOut: nothing,
	newConversation: nothing,
	retry: nothing,
	edit: nothing,
	respondToApproval: nothing,
	respondToDynamicApproval: nothing,
	queue: { moveUp: nothing, moveDown: nothing, remove: nothing, sendNow: nothing },
	openPanel: nothing,
};

/**
 * A model's output level the test moves by hand, as the meter does every frame.
 * @returns The level's source and how to move it.
 */
function movingLevel(): {
	readonly level: AgentVoiceView["level"];
	readonly move: (to: number) => void;
} {
	let now = 0;
	const listeners = new Set<() => void>();
	return {
		level: {
			/**
			 * The level now.
			 * @returns It.
			 */
			read: () => now,
			/**
			 * Hear it move.
			 * @param listener Called on each move.
			 * @returns How to stop.
			 */
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		/**
		 * Move the level, as one frame of the meter does.
		 * @param to Where it is now.
		 */
		move: (to) => {
			now = to;
			for (const listener of listeners) listener();
		},
	};
}

/** The level the test moves, and the live voice it belongs to. */
const { level, move } = movingLevel();
const LISTENING: AgentVoiceView = { stage: "listening", problem: null, busy: false, level };

/** How many times the control has been drawn. */
const drawn = { count: 0 };

/** The control was drawn once more. */
function countDraw(): void {
	drawn.count += 1;
}

test("the Talk control is drawn again when the model starts speaking, not on every frame of its level", () => {
	const shown = render(
		<Profiler id="talk" onRender={countDraw}>
			<TalkControl voice={LISTENING} actions={IDLE_ACTIONS} reducedMotion />
		</Profiler>,
	);
	/**
	 * What the control says the voice is doing, in its word.
	 * @returns The word.
	 */
	const word = (): string | null =>
		shown.container.querySelector("[data-voice-controls='live'] > output")?.textContent ?? null;
	const first = drawn.count;
	expect(word()).toBe("Listening");

	// The frames of a quiet moment, each its own task as frames are: the level
	// moves and stays under the speaking level.
	for (let frame = 1; frame <= 30; frame += 1) {
		act(() => move((VOICE_OUTPUT_SPEAKING_LEVEL * frame) / 40));
	}
	expect(drawn.count).toBe(first);

	// The model starts speaking, and goes on: drawn once.
	act(() => move(VOICE_OUTPUT_SPEAKING_LEVEL * 2));
	act(() => move(VOICE_OUTPUT_SPEAKING_LEVEL * 3));
	expect(drawn.count).toBe(first + 1);
	expect(word()).toBe("Speaking");
});
