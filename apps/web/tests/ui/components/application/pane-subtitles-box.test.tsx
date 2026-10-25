// What a pane draws over its picture for the voice: the voice box while subtitles are on,
// and plain subtitles where the box has no place.
//
// What is guarded: with subtitles on and a voice live the subtitles are the box's, so the voice
// is read where its words are; turning subtitles off takes the box away; a fullscreen presentation,
// which has no dock to take the voice back, keeps the box whatever the person chose and lets the
// subtitles decide only whether there are words; the page that records a talk has plain subtitles
// whatever the person chose, and never the box, because nobody sees that page (the video is
// rendered afterwards by the replay page, with the box); and a voice that is not on has no box.
//
// The words come from a stand-in feed, as a transport publishes them: where the words come from is
// not what is under test.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import { VOICE_BOX_OUT_MS } from "@archboard/timing/voice";
import { PaneSubtitles } from "#ui/components/application/PaneSubtitles.tsx";
import type { VoiceFeed } from "#ui/rules/application/subtitled-transcript.ts";
import { Tooltip } from "@archboard/ui-kit/components";
import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import {
	OrbStageProvider,
	subtitlePreference,
	VoiceSurfaceProvider,
	type AgentVoiceView,
} from "@archboard/workbench/voice";
import type { AgentActions } from "@archboard/workbench/agent";

/**
 * How wide the stand-in canvas measures a text.
 * @param text The text.
 * @returns Its metrics: 10 px per character.
 */
function tenPixelsPerCharacter(text: string): { width: number } {
	return { width: text.length * 10 };
}

/** A canvas whose 2D context measures every character 10 px wide, whatever the font. */
class TenPixelCanvas {
	/**
	 * The drawing context, which only measures.
	 * @returns The context.
	 */
	getContext(): { font: string; measureText: (text: string) => { width: number } } {
		return { font: "", measureText: tenPixelsPerCharacter };
	}
}

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	const box = document.createElement("style");
	box.textContent = "[data-slot='voice-subtitles'] { width: 400px; }";
	document.head.append(box);
	Object.defineProperty(globalThis, "OffscreenCanvas", {
		value: TenPixelCanvas,
		writable: true,
		configurable: true,
	});
});

afterAll(async () => {
	Reflect.deleteProperty(globalThis, "OffscreenCanvas");
	await GlobalRegistrator.unregister();
});

afterEach(() => {
	cleanup();
	subtitlePreference.change(true);
});

/** Nothing happens: the test presses nothing. */
function nothing(): void {
	// No control is used here.
}

/** Actions for a voice nobody presses anything on. */
const NO_ACTIONS: AgentActions = {
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
	showConversation: nothing,
};

/**
 * A voice in a stage that makes no sound.
 * @param stage The stage.
 * @returns The voice.
 */
function voiceIn(stage: AgentVoiceView["stage"]): AgentVoiceView {
	return {
		stage,
		problem: null,
		busy: false,
		level: {
			/**
			 * The level of a voice that makes no sound.
			 * @returns Silence.
			 */
			read: () => 0,
			/**
			 * Nothing to hear.
			 * @returns How to stop hearing nothing.
			 */
			subscribe: () => () => undefined,
		},
	};
}

/**
 * Nothing to hear when the page has no transport to listen on.
 * @returns How to stop listening.
 */
function listenToNothing(): () => undefined {
	return () => undefined;
}

/**
 * A voice a transport carries, with the voice model part way through saying something.
 * @param text What it has said so far; nothing for none.
 * @returns The voice, a value of its own that stays the same until another is made.
 */
function carried(text: string): ReturnType<VoiceFeed["voice"]> {
	const said = [{ itemId: "said-1", speaker: "assistant", text, final: false }] as const;
	return { state: "active", recording: false, transcript: text === "" ? [] : said };
}

/** A voice a transport carries, with nothing said yet. */
const HEARD_VOICE = carried("");

/**
 * The voice the transport last published, which is the same one until it publishes another.
 * @returns The voice.
 */
function heardVoice(): ReturnType<VoiceFeed["voice"]> {
	return HEARD_VOICE;
}

/** A pane's voice as a transport would carry it. */
const HEARD: VoiceFeed = { subscribe: listenToNothing, voice: heardVoice };

/**
 * A voice that says more as the test lets it, as a transport publishes it a word at a time. What a
 * pane finds said when it begins to watch is history, so words show only for what is said after.
 * @returns The feed, and how to have the voice say something.
 */
function speakingFeed(): { readonly feed: VoiceFeed; readonly say: (text: string) => void } {
	let voice = HEARD_VOICE;
	const listeners = new Set<() => void>();
	return {
		feed: {
			/**
			 * Hear the voice change.
			 * @param listener Called on each change.
			 * @returns How to stop.
			 */
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			/**
			 * The voice as last published.
			 * @returns It.
			 */
			voice: () => voice,
		},
		/**
		 * Say something: the voice is published again with it in its transcript.
		 * @param text What the voice model has said so far.
		 */
		say: (text) => {
			voice = carried(text);
			for (const listener of listeners) listener();
		},
	};
}

/** What a pane is given. */
interface PaneSetup {
	readonly stage: AgentVoiceView["stage"];
	readonly recording: boolean;
	/** Whether the agent dock is off screen, as in a fullscreen presentation. */
	readonly dockless: boolean;
	/** Where the pane hears its voice. */
	readonly feed: VoiceFeed;
}

/** A live voice in a pane that can carry it, in the workspace, unless a test says otherwise. */
const LIVE_PANE: PaneSetup = {
	stage: "listening",
	recording: false,
	dockless: false,
	feed: HEARD,
};

/**
 * A pane's subtitles, in a page that has the orb's stage and the voice.
 * @param setup What differs from a live voice in a pane that can carry it.
 * @returns The subtitles, drawn.
 */
function pane(setup: Partial<PaneSetup> = {}): JSX.Element {
	const given = { ...LIVE_PANE, ...setup };
	return (
		<OrbStageProvider>
			<Tooltip.Provider>
				<VoiceSurfaceProvider voice={voiceIn(given.stage)} actions={NO_ACTIONS}>
					<PaneSubtitles
						feed={given.feed}
						reducedMotion={false}
						recording={given.recording}
						dockless={given.dockless}
					/>
				</VoiceSurfaceProvider>
			</Tooltip.Provider>
		</OrbStageProvider>
	);
}

/**
 * Whether the voice box is on the page.
 * @returns True when it is.
 */
function boxed(): boolean {
	return document.querySelector('[data-slot="voice-box"]') !== null;
}

/**
 * Whether the words of the voice box show.
 * @returns True while the box says something.
 */
function words(): boolean {
	return (
		document
			.querySelector('[data-slot="voice-box"] [data-slot="voice-subtitles"]')
			?.getAttribute("data-showing") === "true"
	);
}

/**
 * Whether plain subtitles are on the page: the paragraph, with no box round it.
 * @returns True when they are.
 */
function plain(): boolean {
	return (
		document.querySelector('[data-slot="voice-subtitles"]') !== null &&
		document.querySelector('[data-slot="voice-box"]') === null
	);
}

test("with subtitles on and a voice live the box carries the subtitles", () => {
	render(pane());
	expect(boxed()).toBe(true);
	expect(
		document.querySelector('[data-slot="voice-box"] [data-slot="voice-subtitles"]'),
	).not.toBeNull();
});

test("turning subtitles off takes the box away once it has left", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		render(pane());
		act(() => {
			subtitlePreference.change(false);
		});
		expect(boxed()).toBe(true);
		expect(document.querySelector('[data-slot="voice-box"]')?.hasAttribute("data-leaving")).toBe(
			true,
		);
		act(() => {
			clock.advanceTo(VOICE_BOX_OUT_MS);
		});
		expect(boxed()).toBe(false);
		// No plain subtitles come in its place: subtitles are off.
		expect(plain()).toBe(false);
	} finally {
		restore();
	}
});

test("a voice that is not on has no box", () => {
	render(pane({ stage: "idle" }));
	expect(boxed()).toBe(false);
});

test("a fullscreen presentation has no dock, so the box carries the voice whatever the person chose, and the choice is only whether there are words", () => {
	const { feed, say } = speakingFeed();
	render(pane({ dockless: true, feed }));
	expect(boxed()).toBe(true);
	act(() => {
		say("The ledger sets");
	});
	expect(words()).toBe(true);

	// The words are what the person turns off: the box holds the voice and says nothing.
	act(() => {
		subtitlePreference.change(false);
	});
	expect(boxed()).toBe(true);
	expect(words()).toBe(false);
});

test("the page that records a talk has plain subtitles whatever the person chose, and never the box", () => {
	subtitlePreference.change(false);
	render(pane({ recording: true }));
	expect(boxed()).toBe(false);
	expect(plain()).toBe(true);
});
