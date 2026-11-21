// What a pane lays over its picture for the voice, through the agent: the voice box while
// subtitles are on, and plain subtitles where the box has no place.
//
// What is guarded: with subtitles on and a voice live the subtitles are the box's, so the voice
// is read where its words are; turning subtitles off takes the box away; a fullscreen presentation,
// which has no dock to take the voice back, keeps the box whatever the person chose and lets the
// subtitles decide only whether there are words; the page that records a talk has plain subtitles
// whatever the person chose, and never the box, because nobody sees that page (the video is
// rendered afterwards by the replay page, with the box); a voice that is not on has no box; and
// the voice's words are subtitled while a session carries audio, a recording's only on the page
// that records it (TASK-304, TASK-306), because the server shares one voice session between its
// browsers.
//
// The pane hands the agent a conversation over fakes: its media says how the voice stands, and
// what the conversation publishes says what the voice has said.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { createSteppedClock, driveFramesFrom } from "@archboard/ui-clocks/frame-clock";
import {
	agentPage,
	fakeConversation,
	type FakeConversation,
} from "#tests/ui/support/agent-root/conversation.tsx";
import { listening } from "#tests/ui/support/voice-session/harness.ts";
import { voice } from "#tests/ui/support/voice-session/workbench-fixture.ts";
import { browserIdentities } from "#tests/ui/support/browser-identities.ts";

const ids = browserIdentities();

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
	chooseSubtitles(true);
});

/** Press the subtitles key of the voice box on the page, as the person does. */
function pressSubtitlesKey(): void {
	const key = document.querySelector<HTMLButtonElement>('[data-slot="voice-subtitles-toggle"]');
	if (key === null) {
		throw new Error("The page has no subtitles key to press.");
	}
	act(() => {
		key.click();
	});
}

/**
 * Make the person's subtitle choice before a test draws its page, with the key of a voice box
 * that a fullscreen presentation always draws.
 * @param wanted Whether subtitles are wanted.
 */
function chooseSubtitles(wanted: boolean): void {
	pane({ dockless: true });
	const key = document.querySelector('[data-slot="voice-subtitles-toggle"]');
	if (key?.getAttribute("aria-pressed") !== String(wanted)) {
		pressSubtitlesKey();
	}
	cleanup();
}

/** What a pane is given. */
interface PaneSetup {
	/** Whether the voice is live. */
	readonly live: boolean;
	readonly recording: boolean;
	/** Whether the pane is presented fullscreen, so the agent dock is off screen. */
	readonly dockless: boolean;
}

/** A live voice in a pane that can carry it, in the workspace, unless a test says otherwise. */
const LIVE_PANE: PaneSetup = { live: true, recording: false, dockless: false };

/**
 * Draw a pane with the agent over it, its voice as the test says.
 * @param setup What differs from a live voice in a pane that can carry it.
 * @returns The pane's conversation, to have the voice say something.
 */
function pane(setup: Partial<PaneSetup> = {}): FakeConversation {
	const given = { ...LIVE_PANE, ...setup };
	const fake = fakeConversation();
	if (given.live) fake.media.set(listening());
	render(
		agentPage({
			conversation: fake.conversation,
			recording: given.recording,
			dockless: given.dockless,
		}),
	);
	return fake;
}

/**
 * Have the voice say something, as the conversation publishes it a word at a time.
 * @param fake The pane's conversation.
 * @param text What the voice model has said so far.
 * @param unattended Whether the session is a recording's, which nobody listens to live.
 */
function say(fake: FakeConversation, text: string, unattended = false): void {
	act(() => {
		fake.hear(
			voice({
				state: "active",
				unattended,
				transcript: [
					{ itemId: ids.item("said-1"), sequence: 1, speaker: "assistant", text, final: false },
				],
			}),
		);
	});
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
 * Whether plain subtitles say something.
 * @returns True while they do.
 */
function saidPlainly(): boolean {
	return (
		document.querySelector('[data-slot="voice-subtitles"]')?.getAttribute("data-showing") === "true"
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
	pane();
	expect(boxed()).toBe(true);
	expect(
		document.querySelector('[data-slot="voice-box"] [data-slot="voice-subtitles"]'),
	).not.toBeNull();
});

test("turning subtitles off takes the box away once it has left", () => {
	const clock = createSteppedClock(0);
	const restore = driveFramesFrom(clock);
	try {
		pane();
		pressSubtitlesKey();
		expect(boxed()).toBe(true);
		expect(document.querySelector('[data-slot="voice-box"]')?.hasAttribute("data-leaving")).toBe(
			true,
		);
		act(() => {
			clock.advanceTo(240);
		});
		expect(boxed()).toBe(false);
		// No plain subtitles come in its place: subtitles are off.
		expect(plain()).toBe(false);
	} finally {
		restore();
	}
});

test("a voice that is not on has no box", () => {
	pane({ live: false });
	expect(boxed()).toBe(false);
});

test("a fullscreen presentation has no dock, so the box carries the voice whatever the person chose, and the choice is only whether there are words", () => {
	const fake = pane({ dockless: true });
	expect(boxed()).toBe(true);
	say(fake, "The ledger sets");
	expect(words()).toBe(true);

	// The words are what the person turns off: the box holds the voice and says nothing.
	pressSubtitlesKey();
	expect(boxed()).toBe(true);
	expect(words()).toBe(false);
});

test("the page that records a talk has plain subtitles whatever the person chose, and never the box", () => {
	chooseSubtitles(false);
	pane({ recording: true });
	expect(boxed()).toBe(false);
	expect(plain()).toBe(true);
});

test("the voice's words are subtitled, and a recording's only on the page that records it", () => {
	const shared = pane({ dockless: true });
	say(shared, "The front door", true);
	expect(words()).toBe(false);
	say(shared, "The front door");
	expect(words()).toBe(true);
	cleanup();

	const recorded = pane({ recording: true });
	say(recorded, "The front door");
	expect(saidPlainly()).toBe(false);
	say(recorded, "The front door", true);
	expect(saidPlainly()).toBe(true);
});
