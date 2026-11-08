// The foot of a presented walkthrough's column while voice is on: the Narrate key is the red
// hang-up key while the lit orb is wanted in the voice box, and a press of it ends the voice.
//
// What these catch: a key that cannot end a voice it invites the reader to end, and a key that
// hangs up while the orb is anywhere but the box.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OrbStageProvider, RecordedOrb, VoiceSurfaceProvider } =
	await import("@archboard/workbench/voice");
const { PresentationFoot } =
	await import("#ui/architecture-drawing/canvas/presentation/components/PresentationFoot.tsx");

type Voice = Parameters<typeof RecordedOrb>[0]["voice"];
type Actions = Parameters<typeof VoiceSurfaceProvider>[0]["actions"];

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/** Nothing happens: the test presses nothing else. */
function nothing(): void {
	// No other control is used here.
}

/**
 * Actions that count the times the voice was ended.
 * @param ended Where each end is counted.
 * @returns The actions.
 */
function counting(ended: string[]): Actions {
	return {
		send: nothing,
		talk: nothing,
		mute: nothing,
		unmute: nothing,
		/** Count the end. */
		endVoice: () => {
			ended.push("ended");
		},
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
}

/**
 * A voice in a stage that makes no sound.
 * @param stage The stage.
 * @returns The voice.
 */
function voiceIn(stage: Voice["stage"]): Voice {
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
 * Mount the foot of a presented walkthrough while voice is on.
 * @param stage The voice's stage.
 * @param boxed Whether the lit orb is wanted in the voice box, as a recorded voice wants it.
 * @returns What a press ended, and what it started.
 */
function mount(stage: Voice["stage"], boxed: boolean): { ended: string[]; started: string[] } {
	const ended: string[] = [];
	const started: string[] = [];
	const voice = voiceIn(stage);
	const children: ReactNode[] = [
		createElement(PresentationFoot, {
			key: "foot",
			walkthrough: "tour",
			narration: {
				held: "Voice is on. End it to narrate.",
				starting: false,
				/**
				 * Record a narration.
				 * @param id The walkthrough.
				 */
				start: (id) => {
					started.push(id);
				},
			},
		}),
	];
	if (boxed) children.push(createElement(RecordedOrb, { key: "orb", voice }));
	render(
		<OrbStageProvider>
			<VoiceSurfaceProvider voice={voice} actions={counting(ended)}>
				{children}
			</VoiceSurfaceProvider>
		</OrbStageProvider>,
	);
	return { ended, started };
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

test("while the orb is in the voice box, the key hangs up, and a press ends the voice", async () => {
	const { ended, started } = mount("speaking", true);
	expect(key().getAttribute("data-hang-up")).toBe("true");
	expect(key().getAttribute("aria-disabled")).toBeNull();
	expect(heard()).toBe("Hang upEnd the voice.");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(ended).toEqual(["ended"]);
	expect(started).toEqual([]);
});

test("a press ends nothing once the voice is ending", async () => {
	const { ended } = mount("stopping", true);
	expect(key().getAttribute("aria-disabled")).toBe("true");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(ended).toEqual([]);
});

test("while the orb is not in the box, the key is the held Narrate key and ends nothing", async () => {
	const { ended, started } = mount("listening", false);
	expect(key().getAttribute("data-hang-up")).toBe("false");
	expect(key().getAttribute("aria-disabled")).toBe("true");
	expect(heard()).toBe("NarrateVoice is on. End it to narrate.");
	await act(async () => {
		fireEvent.click(key());
	});
	expect(ended).toEqual([]);
	expect(started).toEqual([]);
});
