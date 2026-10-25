// The subtitles as a user sees them.
//
// What is guarded: a word is on screen as soon as it arrives and earlier speech is not replayed;
// each word fades in, a cue that gives way to the next fades under it, and a subtitle that has
// lingered fades out and is then gone; the words are the voice model's and never the user's;
// turning subtitles off takes them away at once and stays off for the next visit; and keyboard
// focus follows the subtitles control to the surface that takes it over.
//
// The box is measured for where it breaks its lines. This DOM lays nothing out and has no canvas,
// so the box is given a width by a stylesheet, and pretext measures with a stand-in canvas on
// which every character is 10 px wide (pretext 0.0.9 measures with OffscreenCanvas when there is
// one).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { useSyncExternalStore, type JSX } from "react";

import { SUBTITLE_LINGER_MS } from "@archboard/timing";
import { SUBTITLE_OUT_MS, SUBTITLE_SWAP_MS } from "@archboard/timing/voice";
import { Tooltip } from "@archboard/ui-kit/components";
import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import { SubtitlesToggle } from "#ui/components/subtitles/SubtitlesToggle.tsx";
import { VoiceSubtitles } from "#ui/components/subtitles/VoiceSubtitles.tsx";
import {
	createSubtitlePreference,
	type SubtitlePreference,
} from "#ui/state/subtitles/preference.ts";
import { type SubtitleSource } from "#ui/hooks/subtitles/use-voice-subtitles.ts";

/**
 * How wide the stand-in canvas measures a text.
 * @param text - The text.
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
});

/**
 * A transcript in which the voice model has said some words after the user spoke.
 * @param said What the voice model has said so far.
 * @returns The transcript.
 */
function transcriptOf(said: string): readonly SubtitleSource[] {
	return [
		{ itemId: "u1", speaker: "user", text: "walk me through the vault", final: true },
		{ itemId: "a1", speaker: "assistant", text: said, final: false },
	];
}

/** Before anybody spoke. */
const NOTHING_SAID_YET: readonly SubtitleSource[] = [];

/** Only what the user said. */
const SAID_BY_THE_PERSON = transcriptOf("").slice(0, 1);

/**
 * The words on screen: not the lines of a cue that is giving way, which fade under them.
 * @returns What the subtitle reads, or null when there is none.
 */
function onScreen(): string | null {
	const words = document.querySelector("[data-slot='voice-subtitles'] > span");
	const reading = [...(words?.children ?? [])].filter(
		(word) => !word.hasAttribute("data-fade-out"),
	);
	return reading.map((word) => word.textContent).join("") || null;
}

/**
 * Whether the subtitle says it is showing words, or is fading them out.
 * @returns The subtitle's own word for it, or null when there is no subtitle.
 */
function showing(): string | null {
	return (
		document.querySelector("[data-slot='voice-subtitles']")?.getAttribute("data-showing") ?? null
	);
}

/**
 * The words that are fading in, which are the ones that arrived while motion was wanted.
 * @returns Their elements, in order.
 */
function fadingIn(): Element[] {
	return [...document.querySelectorAll("[data-slot='voice-subtitles'] [data-fade]")];
}

/**
 * The lines of a cue that is giving way, which fade under the one that replaces it.
 * @returns What they read, or null when no cue is giving way.
 */
function fadingOut(): string | null {
	return (
		document.querySelector("[data-slot='voice-subtitles'] [data-fade-out]")?.textContent ?? null
	);
}

/** Two utterances, the second begun at once, as the voice model sends them. */
const SURE_THEN_HERE: readonly SubtitleSource[] = [
	{ itemId: "a1", speaker: "assistant", text: "Sure.", final: true },
	{ itemId: "a2", speaker: "assistant", text: "Here", final: false },
];

test("a word is on screen as soon as it arrives, and what was said earlier is not replayed", () => {
	const view = render(
		<VoiceSubtitles transcript={transcriptOf("The vault holds")} enabled reducedMotion />,
	);
	// Said before the subtitles began watching: history, which the transcript panel shows.
	expect(onScreen()).toBeNull();
	view.rerender(
		<VoiceSubtitles transcript={transcriptOf("The vault holds one")} enabled reducedMotion />,
	);
	expect(onScreen()).toBe("The vault holds one");
	view.rerender(
		<VoiceSubtitles
			transcript={transcriptOf("The vault holds one document")}
			enabled
			reducedMotion
		/>,
	);
	expect(onScreen()).toBe("The vault holds one document");
});

test("the subtitle begins again where its box would wrap to a third line", () => {
	const said =
		"The server checks the write, takes the lease of the board, commits the whole family";
	const words = said.split(" ");
	const view = render(<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion />);
	view.rerender(
		<VoiceSubtitles
			transcript={transcriptOf(words.slice(0, -1).join(" "))}
			enabled
			reducedMotion
		/>,
	);
	// Two full lines of the box's 40 characters.
	expect(onScreen()).toBe(words.slice(0, -1).join(" "));
	view.rerender(<VoiceSubtitles transcript={transcriptOf(said)} enabled reducedMotion />);
	expect(onScreen()).toBe("family");
});

test("the subtitle fades out once the voice has been silent for the linger, and is gone when it has", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion />);
		view.rerender(<VoiceSubtitles transcript={transcriptOf("Done.")} enabled reducedMotion />);
		expect(onScreen()).toBe("Done.");
		expect(showing()).toBe("true");
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS - 1);
		});
		expect(showing()).toBe("true");
		// The linger has run out: the words stay while the paragraph fades, and go once it has.
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS);
		});
		expect(showing()).toBe("false");
		expect(onScreen()).toBe("Done.");
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS + SUBTITLE_OUT_MS);
		});
		expect(onScreen()).toBeNull();
	} finally {
		restore();
	}
});

test("each word fades in as it arrives, and none does for a person who asked for no motion", () => {
	const view = render(
		<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion={false} />,
	);
	view.rerender(
		<VoiceSubtitles transcript={transcriptOf("One writer")} enabled reducedMotion={false} />,
	);
	expect(fadingIn().map((word) => word.textContent)).toEqual(["One", " writer"]);
	const first = fadingIn()[0];
	view.rerender(
		<VoiceSubtitles transcript={transcriptOf("One writer at")} enabled reducedMotion={false} />,
	);
	// A word that was there is not faded in again, and the new one is.
	expect(fadingIn()[0]).toBe(first);
	expect(fadingIn().map((word) => word.textContent)).toEqual(["One", " writer", " at"]);

	view.rerender(
		<VoiceSubtitles transcript={transcriptOf("One writer at a")} enabled reducedMotion />,
	);
	expect(fadingIn()).toHaveLength(0);
	expect(document.querySelector("[data-slot='voice-subtitles']")?.hasAttribute("data-still")).toBe(
		true,
	);
});

test("a cue gives way to the next with its lines fading under it, and they are gone when they have", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const said =
			"The server checks the write, takes the lease of the board, commits the whole family";
		const words = said.split(" ");
		const view = render(
			<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion={false} />,
		);
		view.rerender(
			<VoiceSubtitles
				transcript={transcriptOf(words.slice(0, -1).join(" "))}
				enabled
				reducedMotion={false}
			/>,
		);
		expect(fadingOut()).toBeNull();

		view.rerender(<VoiceSubtitles transcript={transcriptOf(said)} enabled reducedMotion={false} />);
		expect(onScreen()).toBe("family");
		expect(fadingOut()).toBe(words.slice(0, -1).join(" "));
		act(() => {
			clock.advanceTo(SUBTITLE_SWAP_MS);
		});
		expect(fadingOut()).toBeNull();
	} finally {
		restore();
	}
});

test("words that had begun to fade out do not come back under the next ones", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(
			<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion={false} />,
		);
		view.rerender(
			<VoiceSubtitles transcript={transcriptOf("Done.")} enabled reducedMotion={false} />,
		);
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS);
		});
		// The paragraph is fading out, and its words are still there.
		expect(showing()).toBe("false");
		expect(onScreen()).toBe("Done.");

		view.rerender(<VoiceSubtitles transcript={SURE_THEN_HERE} enabled reducedMotion={false} />);
		expect(onScreen()).toBe("Here");
		expect(fadingOut()).toBeNull();
	} finally {
		restore();
	}
});

test("an utterance that begins at once does not reuse the words of the one before it", () => {
	const view = render(
		<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion={false} />,
	);
	view.rerender(
		<VoiceSubtitles transcript={transcriptOf("Sure.")} enabled reducedMotion={false} />,
	);
	const before = fadingIn()[0];
	expect(before?.textContent).toBe("Sure.");

	view.rerender(<VoiceSubtitles transcript={SURE_THEN_HERE} enabled reducedMotion={false} />);
	// The first word of the new utterance arrives as a word of its own: it fades in.
	expect(fadingIn()[0]).not.toBe(before);
	expect(fadingIn()[0]?.textContent).toBe("Here");
});

test("what the user said is never subtitled", () => {
	const view = render(<VoiceSubtitles transcript={NOTHING_SAID_YET} enabled reducedMotion />);
	view.rerender(<VoiceSubtitles transcript={SAID_BY_THE_PERSON} enabled reducedMotion />);
	expect(onScreen()).toBeNull();
});

/** A browser's storage, kept in a map. */
const kept = new Map<string, string>();
const storage = {
	/**
	 * Read a kept value.
	 * @param key Its key.
	 * @returns The value, or null.
	 */
	getItem: (key: string): string | null => kept.get(key) ?? null,
	/**
	 * Keep a value.
	 * @param key Its key.
	 * @param value The value.
	 */
	setItem: (key: string, value: string): void => {
		kept.set(key, value);
	},
};

/** Inputs for the governed subtitles. */
interface GovernedProps {
	readonly preference: SubtitlePreference;
	readonly said: string;
}

/**
 * The subtitles governed by the toggle beside them, as the shell composes them.
 * @param props The preference both read.
 * @returns The toggle and the subtitles.
 */
function Governed(props: GovernedProps): JSX.Element {
	const { preference } = props;
	const wanted = useSyncExternalStore(preference.subscribe, preference.wanted);
	return (
		<Tooltip.Provider>
			<SubtitlesToggle preference={preference} />
			<VoiceSubtitles transcript={transcriptOf(props.said)} enabled={wanted} reducedMotion />
		</Tooltip.Provider>
	);
}

/**
 * The subtitles toggle.
 * @returns The button.
 */
function toggleButton(): HTMLElement {
	const toggle = document.querySelector<HTMLElement>("[data-slot='voice-subtitles-toggle']");
	if (toggle === null) {
		throw new Error("There is no subtitles toggle.");
	}
	return toggle;
}

test("the toggle takes the subtitles away and the choice is kept", () => {
	kept.clear();
	const preference = createSubtitlePreference(storage);
	const view = render(<Governed preference={preference} said="" />);
	view.rerender(<Governed preference={preference} said="One writer" />);
	expect(onScreen()).toBe("One writer");
	expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
	act(() => {
		fireEvent.click(toggleButton());
	});
	expect(onScreen()).toBeNull();
	expect(toggleButton().getAttribute("aria-pressed")).toBe("false");
	expect(createSubtitlePreference(storage).wanted()).toBe(false);
	// Turned on again mid-utterance, it waits for the next word rather than replaying.
	act(() => {
		fireEvent.click(toggleButton());
	});
	expect(onScreen()).toBeNull();
	view.rerender(<Governed preference={preference} said="One writer at" />);
	expect(onScreen()).toBe("One writer at");
});

/**
 * The subtitles control in one of two surfaces, which the preference decides between, as the
 * dock's voice line and the voice box are.
 * @param props The preference both read.
 * @param props.preference The preference.
 * @returns The control, in the surface that has it.
 */
function Surfaces(props: { readonly preference: SubtitlePreference }): JSX.Element {
	const { preference } = props;
	const wanted = useSyncExternalStore(preference.subscribe, preference.wanted);
	return (
		<Tooltip.Provider>
			<div key={wanted ? "box" : "dock"} data-surface={wanted ? "box" : "dock"}>
				<SubtitlesToggle preference={preference} />
			</div>
		</Tooltip.Provider>
	);
}

/**
 * The surface that holds the focus.
 * @returns "box", "dock" or null.
 */
function focusSurface(): string | null {
	return document.activeElement?.closest("[data-surface]")?.getAttribute("data-surface") ?? null;
}

test("keyboard focus follows the subtitles control to the surface that takes it over", () => {
	kept.clear();
	const preference = createSubtitlePreference(storage);
	render(<Surfaces preference={preference} />);
	act(() => {
		toggleButton().focus();
	});
	expect(focusSurface()).toBe("box");
	act(() => {
		fireEvent.click(toggleButton());
	});
	expect(focusSurface()).toBe("dock");
	act(() => {
		fireEvent.click(toggleButton());
	});
	expect(focusSurface()).toBe("box");
});

test("a subtitles control that did not have focus hands none on", () => {
	kept.clear();
	const preference = createSubtitlePreference(storage);
	render(<Surfaces preference={preference} />);
	act(() => {
		fireEvent.click(toggleButton());
	});
	expect(document.querySelector("[data-surface='dock']")).not.toBeNull();
	expect(focusSurface()).toBeNull();
});

/**
 * Both surfaces on the page at once, as the voice box is while it leaves: the one the preference
 * does not choose is inert, and still has its control.
 * @param props The preference both read.
 * @param props.preference The preference.
 * @returns The two controls.
 */
function BothSurfaces(props: { readonly preference: SubtitlePreference }): JSX.Element {
	const { preference } = props;
	const wanted = useSyncExternalStore(preference.subscribe, preference.wanted);
	return (
		<Tooltip.Provider>
			<div data-surface="box" inert={!wanted}>
				<SubtitlesToggle preference={preference} />
			</div>
			<div data-surface="dock" inert={wanted}>
				<SubtitlesToggle preference={preference} />
			</div>
		</Tooltip.Provider>
	);
}

/**
 * The subtitles control in one surface.
 * @param surface Which surface.
 * @returns The button.
 */
function toggleIn(surface: string): HTMLElement {
	const toggle = document.querySelector<HTMLElement>(
		`[data-surface='${surface}'] [data-slot='voice-subtitles-toggle']`,
	);
	if (toggle === null) throw new Error(`There is no subtitles toggle in the ${surface}.`);
	return toggle;
}

test("focus follows the control when the surface that was pressed stays on the page, and when it is pressed again at once", () => {
	kept.clear();
	const preference = createSubtitlePreference(storage);
	render(<BothSurfaces preference={preference} />);
	act(() => {
		toggleIn("box").focus();
	});
	act(() => {
		fireEvent.click(toggleIn("box"));
	});
	expect(focusSurface()).toBe("dock");
	// Pressed again before the box has gone: the choice turns round, and focus with it.
	act(() => {
		fireEvent.click(toggleIn("dock"));
	});
	expect(focusSurface()).toBe("box");
});

test("a subtitles control that is still there with focus keeps it, whatever other controls are on the page", () => {
	kept.clear();
	const preference = createSubtitlePreference(storage);
	render(
		<Tooltip.Provider>
			<div data-surface="bar">
				<SubtitlesToggle preference={preference} />
			</div>
			<div data-surface="elsewhere">
				<SubtitlesToggle preference={preference} />
			</div>
		</Tooltip.Provider>,
	);
	act(() => {
		toggleIn("bar").focus();
	});
	act(() => {
		fireEvent.click(toggleIn("bar"));
	});
	expect(focusSurface()).toBe("bar");
});
