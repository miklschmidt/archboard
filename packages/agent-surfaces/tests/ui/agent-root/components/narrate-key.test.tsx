// The Narrate key at the foot of a presented walkthrough while voice is on: it is the red hang-up
// key while the lit orb is wanted in the voice box, and a press of it ends the voice.
//
// What these catch: a key that cannot end a voice it invites the reader to end, a key that ends
// it twice, and a key that hangs up while the orb is anywhere but the box. The page holds the
// agent over one pane, whose conversation's media counts the stops; the dock is drawn, because the
// dock decides where the lit orb is wanted.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { AgentDock } = await import("#ui/agent-root/components/AgentSurfaces.tsx");
const { NarrateKey } = await import("#ui/agent-root/components/NarrateKey.tsx");
const { agentPage, fakeConversation } =
	await import("#tests/ui/support/agent-root/conversation.tsx");
const { mediaSnapshot } = await import("#tests/ui/support/voice-session/fakes.ts");
const { subtitlePreference } = await import("#ui/workbench-client/subtitles/state/preference.ts");

afterEach(() => {
	cleanup();
	subtitlePreference.change(true);
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/**
 * Mount the foot of a presented walkthrough while the voice speaks.
 * @param boxed Whether the person wants subtitles, so the lit orb is wanted in the voice box.
 * @returns How many times the voice's media was stopped, and what a press started, once drawn.
 */
async function mount(
	boxed: boolean,
): Promise<{ readonly stops: () => number; readonly started: string[] }> {
	subtitlePreference.change(boxed);
	const started: string[] = [];
	const fake = fakeConversation();
	fake.media.set(mediaSnapshot({ phase: "speaking", reason: "assistant_started" }));
	// A stop that never settles keeps the voice ending, as a slow one does.
	fake.media.onStop(() => new Promise(() => undefined));
	render(
		agentPage({
			conversation: fake.conversation,
			children: [
				createElement(AgentDock, { key: "dock", reducedMotion: true, dockless: false, lead: null }),
				createElement(NarrateKey, {
					key: "key",
					walkthrough: "tour",
					held: "Voice is on. End it to narrate.",
					/**
					 * Record a narration.
					 * @param walkthrough The walkthrough.
					 */
					onNarrate: (walkthrough: string) => {
						started.push(walkthrough);
					},
				}),
			],
		}),
	);
	// The dock places the orb once it has drawn.
	await act(() => Promise.resolve());
	return {
		/**
		 * How many times the media was stopped.
		 * @returns The count.
		 */
		stops: () => fake.media.calls().filter((call) => call === "stop").length,
		started,
	};
}

/**
 * The key at the foot of the column.
 * @returns The key.
 */
function key(): HTMLElement {
	return document.querySelector<HTMLElement>("[data-slot='semantic-presentation-narrate']")!;
}

/**
 * The words a screen reader hears on the key.
 * @returns Its words, without those hidden from it.
 */
function heard(): string {
	const shown = [...key().querySelectorAll<HTMLElement>("[data-part$='-words']")].filter(
		(words) => words.getAttribute("aria-hidden") === null,
	);
	return shown.map((words) => words.textContent).join(" ");
}

test("while the orb is in the voice box, the key hangs up, a press ends the voice, and a second press ends nothing", async () => {
	const { stops, started } = await mount(true);
	expect(key().getAttribute("data-hang-up")).toBe("true");
	expect(key().getAttribute("aria-disabled")).toBeNull();
	expect(heard()).toBe("Hang upEnd the voice.");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(stops()).toBe(1);
	expect(started).toEqual([]);

	// The voice is ending: the key ends nothing more.
	expect(key().getAttribute("aria-disabled")).toBe("true");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(stops()).toBe(1);
});

test("while the orb is not in the box, the key is the held Narrate key and ends nothing", async () => {
	const { stops, started } = await mount(false);
	expect(key().getAttribute("data-hang-up")).toBe("false");
	expect(key().getAttribute("aria-disabled")).toBe("true");
	expect(heard()).toBe("NarrateVoice is on. End it to narrate.");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(stops()).toBe(0);
	expect(started).toEqual([]);
});
