// The voice box over a pane's picture: the voice, where the subtitles are read.
//
// What is guarded: the box carries everything the dock's voice line did, so nothing is lost by the
// voice leaving the dock (the orb's socket, the voice's state in a word, mute and the subtitles
// control); its two controls act on the voice and on the preference; it comes and goes with the
// voice, staying on the page for as long as it takes to leave so that it eases away under the
// orb's flight and is not cut from under it, taking no input while it does, and turning round
// from where it is when it is wanted again; and a person who asked for no motion sees it come
// and go at once.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import { VOICE_BOX_OUT_MS } from "@archboard/timing/voice";
import { Tooltip } from "@archboard/ui-kit/components";
import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import { OrbStageProvider } from "#ui/components/orb/OrbStage.tsx";
import { subtitlePreference } from "#ui/state/subtitles/preference.ts";
import { type SubtitleSource } from "#ui/hooks/subtitles/use-voice-subtitles.ts";
import { VoiceBox } from "#ui/components/voice/VoiceBox.tsx";
import type { AgentActions, AgentVoiceView } from "#ui/state/surfaces/contracts.ts";
import { IDLE_ACTIONS, recordingActions, voiceIn } from "#tests/ui/support/dock/voice-fixtures.ts";

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
	const style = document.createElement("style");
	style.textContent = "[data-slot='voice-subtitles'] { width: 400px; }";
	document.head.append(style);
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

/** What was said before the person looked: nothing. */
const NOTHING_SAID: readonly SubtitleSource[] = [];

/** What the box is given. */
interface BoxSetup {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly shown: boolean;
	readonly reducedMotion: boolean;
	readonly transcript: readonly SubtitleSource[];
}

/** A listening voice with nothing said, in a box that is wanted and that comes and goes at once. */
const LISTENING: BoxSetup = {
	voice: voiceIn("listening"),
	actions: IDLE_ACTIONS,
	shown: true,
	reducedMotion: true,
	transcript: NOTHING_SAID,
};

/**
 * What the box is given, where the test says what differs from a listening voice.
 * @param setup What differs.
 * @returns All of it.
 */
function given(setup: Partial<BoxSetup>): BoxSetup {
	return { ...LISTENING, ...setup };
}

/**
 * The box, in a page that has the orb's stage.
 * @param setup What differs from a listening voice with nothing said.
 * @returns The box, drawn.
 */
function box(setup: Partial<BoxSetup> = {}): JSX.Element {
	const { voice, actions, shown, reducedMotion, transcript } = given(setup);
	return (
		<OrbStageProvider>
			<Tooltip.Provider>
				<VoiceBox
					voice={voice}
					actions={actions}
					transcript={transcript}
					reducedMotion={reducedMotion}
					shown={shown}
					place="free"
				/>
			</Tooltip.Provider>
		</OrbStageProvider>
	);
}

/**
 * The voice box on the page.
 * @returns It, or null.
 */
function theBox(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-slot="voice-box"]');
}

/**
 * A control of the box, by its name.
 * @param name The control's accessible name.
 * @returns The button, or null.
 */
function control(name: string): HTMLElement | null {
	return theBox()?.querySelector<HTMLElement>(`[aria-label="${name}"]`) ?? null;
}

/**
 * Press a control of the box, by its name.
 * @param name The control's accessible name.
 */
function press(name: string): void {
	const button = control(name);
	if (button === null) throw new Error(`The box has no ${name} control.`);
	act(() => {
		fireEvent.click(button);
	});
}

test("the box holds what the dock's voice line did: the orb's socket, the state in words, mute and the subtitles control", () => {
	render(box());
	expect(theBox()?.querySelector('[data-slot="voice-orb-socket"][data-home="box"]')).not.toBeNull();
	expect(theBox()?.querySelector("output")?.textContent).toBe("Listening");
	expect(control("Mute")).not.toBeNull();
	expect(control("Hide subtitles")).not.toBeNull();
	expect(theBox()?.querySelector('[data-slot="voice-subtitles"]')).not.toBeNull();
});

test("its words follow the voice: muted says so and offers to unmute, and a control on the wire is held", () => {
	const pressed: string[] = [];
	const actions = recordingActions(pressed);
	const view = render(box({ actions }));
	press("Mute");
	expect(pressed).toEqual(["mute"]);

	view.rerender(box({ actions, voice: voiceIn("muted") }));
	expect(theBox()?.querySelector("output")?.textContent).toBe("Muted");
	expect(control("Mute")).toBeNull();
	press("Unmute");
	expect(pressed).toEqual(["mute", "unmute"]);

	// A control on the wire cannot be pressed again.
	view.rerender(box({ actions, voice: voiceIn("muted", true) }));
	expect(control("Unmute")?.getAttribute("aria-disabled")).toBe("true");
	press("Unmute");
	expect(pressed).toEqual(["mute", "unmute"]);
});

test("the subtitles control in the box turns subtitles off for the page", () => {
	render(box());
	expect(subtitlePreference.wanted()).toBe(true);
	press("Hide subtitles");
	expect(subtitlePreference.wanted()).toBe(false);
});

test("the box stays on the page for as long as it takes to leave, and is gone when it has", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(box());
		expect(theBox()?.hasAttribute("data-leaving")).toBe(false);

		view.rerender(box({ shown: false, reducedMotion: false }));
		expect(theBox()?.hasAttribute("data-leaving")).toBe(true);
		// It takes no input while it leaves: its controls are not for pressing, nor to be tabbed to.
		expect(theBox()?.hasAttribute("inert")).toBe(true);
		act(() => {
			clock.advanceTo(VOICE_BOX_OUT_MS - 1);
		});
		expect(theBox()).not.toBeNull();
		act(() => {
			clock.advanceTo(VOICE_BOX_OUT_MS);
		});
		expect(theBox()).toBeNull();

		// It comes back with the voice, with nothing left of the last time.
		view.rerender(box({ shown: true, reducedMotion: false }));
		expect(theBox()?.hasAttribute("data-leaving")).toBe(false);
	} finally {
		restore();
	}
});

test("a box that is wanted again while it leaves is the same box, turned round, and the first wait takes nothing", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(box());
		view.rerender(box({ shown: false, reducedMotion: false }));
		const leaving = theBox();
		act(() => {
			clock.advanceTo(VOICE_BOX_OUT_MS / 2);
		});
		view.rerender(box({ shown: true, reducedMotion: false }));
		expect(theBox()).toBe(leaving);
		expect(theBox()?.hasAttribute("data-leaving")).toBe(false);
		expect(theBox()?.hasAttribute("inert")).toBe(false);

		act(() => {
			clock.advanceTo(VOICE_BOX_OUT_MS * 2);
		});
		expect(theBox()).toBe(leaving);
	} finally {
		restore();
	}
});

test("a person who asked for no motion sees the box go at once", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(box({ reducedMotion: true }));
		view.rerender(box({ shown: false, reducedMotion: true }));
		act(() => {
			clock.advanceTo(0);
		});
		expect(theBox()).toBeNull();
	} finally {
		restore();
	}
});
