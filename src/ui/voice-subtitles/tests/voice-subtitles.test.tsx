// The subtitles as a person sees them.
//
// What is guarded: a word is on screen as soon as it arrives and earlier speech is not replayed;
// the subtitle goes after a real silence; the words are the voice model's and never the person's;
// and turning subtitles off takes them away at once and stays off for the next visit.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { useSyncExternalStore, type JSX } from "react";

import { SUBTITLE_LINGER_MS } from "@/shared/timing/timing";
import { TooltipProvider } from "@/ui/components/tooltip";
import {
	SubtitlesToggle,
	VoiceSubtitles,
	createSubtitlePreference,
	type SubtitlePreference,
	type SubtitleSource,
} from "@/ui/voice-subtitles";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

afterEach(() => {
	cleanup();
});

/**
 * Let real time pass.
 * @param ms How long.
 */
async function pass(ms: number): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, ms);
		});
	});
}

/**
 * A transcript in which the voice model has said some words after the person spoke.
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

/** Only what the person said. */
const SAID_BY_THE_PERSON = transcriptOf("").slice(0, 1);

/**
 * The words on screen.
 * @returns What the subtitle reads, or null when there is none.
 */
function onScreen(): string | null {
	return document.querySelector("[data-slot='voice-subtitles']")?.textContent ?? null;
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

test("the subtitle goes once the voice has been silent for the linger", async () => {
	const view = render(<VoiceSubtitles transcript={transcriptOf("")} enabled reducedMotion />);
	view.rerender(<VoiceSubtitles transcript={transcriptOf("Done.")} enabled reducedMotion />);
	expect(onScreen()).toBe("Done.");
	await pass(SUBTITLE_LINGER_MS + 200);
	expect(onScreen()).toBeNull();
});

test("what the person said is never subtitled", () => {
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
