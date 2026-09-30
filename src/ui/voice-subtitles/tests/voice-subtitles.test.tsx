// The subtitles as a user sees them.
//
// What is guarded: a word is on screen as soon as it arrives and earlier speech is not replayed;
// the subtitle goes after the linger of silence, not before; the words are the voice model's and
// never the user's; and turning subtitles off takes them away at once and stays off for the next
// visit.
//
// The box is measured for where it breaks its lines. This DOM lays nothing out and has no canvas,
// so the box is given a width by a stylesheet, and pretext measures with a stand-in canvas on
// which every character is 10 px wide (pretext 0.0.9 measures with OffscreenCanvas when there is
// one).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { useSyncExternalStore, type JSX } from "react";

import { SUBTITLE_LINGER_MS } from "@/shared/timing/timing";
import { TooltipProvider } from "@/ui/components/tooltip";
import { driveFramesFrom } from "@/ui/frame-clock";
import { createSteppedClock } from "@/ui/frame-clock/replay";
import {
	SubtitlesToggle,
	VoiceSubtitles,
	createSubtitlePreference,
	type SubtitlePreference,
	type SubtitleSource,
} from "@/ui/voice-subtitles";

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
 * The words on screen.
 * @returns What the subtitle reads, or null when there is none.
 */
function onScreen(): string | null {
	return document.querySelector("[data-slot='voice-subtitles']")?.textContent || null;
}

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

test("the subtitle goes once the voice has been silent for the linger", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		const view = render(<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion />);
		view.rerender(<VoiceSubtitles transcript={transcriptOf("Done.")} enabled reducedMotion />);
		expect(onScreen()).toBe("Done.");
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS - 1);
		});
		expect(onScreen()).toBe("Done.");
		act(() => {
			clock.advanceTo(SUBTITLE_LINGER_MS);
		});
		expect(onScreen()).toBeNull();
	} finally {
		restore();
	}
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
		<TooltipProvider>
			<SubtitlesToggle preference={preference} />
			<VoiceSubtitles transcript={transcriptOf(props.said)} enabled={wanted} reducedMotion />
		</TooltipProvider>
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
