// The agent dock's voice control is one button while voice is off and while it
// is on. Pressing Talk must not swap the control for another, because the dock
// moves it between its shapes and a person who pressed it by keyboard keeps their
// place on it. While subtitles are on and a voice box is on the page it carries the voice, and
// the dock is calm, with the key ending voice; turning subtitles off puts the voice back at
// the head of the dock, in the same button. A page with no box leaves the voice in the dock.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import type { AgentSetupSnapshot } from "#ui/state/agent-setup/setup.ts";
import { OrbSlot, OrbStageProvider } from "#ui/components/orb/OrbStage.tsx";
import { subtitlePreference } from "#ui/state/subtitles/preference.ts";
import { AgentDock } from "#ui/components/dock/AgentDock.tsx";
import type { AgentView, AgentVoiceView } from "#ui/state/surfaces/contracts.ts";
import {
	IDLE_ACTIONS,
	nothing,
	recordingActions,
	voiceIn,
} from "#tests/ui/support/dock/voice-fixtures.ts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

afterEach(() => {
	subtitlePreference.change(true);
});

const READY: AgentSetupSnapshot = {
	phase: { kind: "ready", linked: true },
	held: [],
	talk: "idle",
	step: null,
	failure: null,
	talkFailure: null,
};

/**
 * A ready agent with nothing to say, and a voice in a stage.
 * @param stage The voice's stage.
 * @param busy Whether a voice control is on the wire.
 * @returns The view.
 */
function viewWith(stage: AgentVoiceView["stage"], busy = false): AgentView {
	return {
		setup: READY,
		snapshot: null,
		conversation: { snapshot: null, turns: [], coordinatorTurns: [], failure: null },
		voice: voiceIn(stage, busy),
		context: { board: "payments", state: null },
		busyApprovals: [],
		approvalErrors: {},
		lastProgressAtMs: null,
	};
}

/**
 * The dock, in a voice stage, on a page that has a voice box or not. The box is stood in for by
 * its socket, which is all the dock asks of it.
 * @param stage The voice's stage.
 * @param reducedMotion Whether the person asked for no motion.
 * @param box Whether a voice box is on the page.
 * @returns The dock, drawn.
 */
function dock(stage: AgentVoiceView["stage"], reducedMotion = true, box = false): JSX.Element {
	return (
		<OrbStageProvider>
			<AgentDock
				view={viewWith(stage)}
				actions={IDLE_ACTIONS}
				panelOpen={false}
				unread={false}
				onTogglePanel={nothing}
				reducedMotion={reducedMotion}
				dockless={false}
			/>
			{box && <OrbSlot home="box" />}
		</OrbStageProvider>
	);
}

test("the key that says Talk is the circle that ends voice, and keeps the keyboard's place", () => {
	const shown = render(dock("idle"));
	/**
	 * The dock's root.
	 * @returns It.
	 */
	const root = (): Element | null => shown.container.querySelector('[data-slot="agent-dock"]');
	/**
	 * The voice control.
	 * @returns It.
	 */
	const voice = (): HTMLElement | null =>
		shown.container.querySelector<HTMLElement>('[data-slot="voice-circle"]');
	const key = voice();
	expect(key?.getAttribute("aria-label")).toBe("Talk");
	expect(root()?.getAttribute("data-live")).toBe("false");
	act(() => {
		key?.focus();
	});
	expect(document.activeElement).toBe(key);

	shown.rerender(dock("listening"));

	expect(voice()).toBe(key);
	expect(voice()?.getAttribute("aria-label")).toBe("End voice");
	expect(root()?.getAttribute("data-live")).toBe("true");
	expect(document.activeElement).toBe(key);
});

test("while voice is on the wire or ending the key presses nothing and stays in the tab order", () => {
	for (const [stage, busy] of [
		["preparing", true],
		["preparing", false],
		["stopping", false],
	] as const) {
		const pressed: string[] = [];
		const shown = render(
			<OrbStageProvider>
				<AgentDock
					view={viewWith(stage, busy)}
					actions={recordingActions(pressed)}
					panelOpen={false}
					unread={false}
					onTogglePanel={nothing}
					reducedMotion
					dockless={false}
				/>
			</OrbStageProvider>,
		);
		const key = shown.container.querySelector<HTMLElement>('[data-slot="voice-circle"]');
		act(() => key?.click());
		expect(pressed).toEqual([]);
		expect(key?.getAttribute("aria-disabled")).toBe("true");
		// A disabled button would drop the keyboard's place while Talk turns into the circle.
		expect(key?.hasAttribute("disabled")).toBe(false);
		shown.unmount();
	}
});

/** How many animations the page was asked to play. */
const played = { count: 0 };

/** The page's own way to animate, put back after a test replaces it. */
let animateKept: PropertyDescriptor | undefined;

afterEach(() => {
	if (animateKept === undefined) Reflect.deleteProperty(HTMLElement.prototype, "animate");
	else Object.defineProperty(HTMLElement.prototype, "animate", animateKept);
});

/**
 * Stand in for the browser's animations, and count what the page asks of them.
 * @returns Nothing: the dock does not read what an animation returns.
 */
function countAnimation(): undefined {
	played.count += 1;
	return undefined;
}

/**
 * Count the animations the page is asked for while something happens.
 * @param happens What happens, with the dock drawn in the state it starts in.
 * @returns How many animations were played.
 */
function animationsWhile(happens: () => void): number {
	played.count = 0;
	animateKept = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
	Object.defineProperty(HTMLElement.prototype, "animate", {
		configurable: true,
		writable: true,
		value: countAnimation,
	});
	happens();
	return played.count;
}

/**
 * Count the animations the dock asks for while voice starts.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns How many animations were played.
 */
function animationsWhenVoiceStarts(reducedMotion: boolean): number {
	return animationsWhile(() => {
		const shown = render(dock("idle", reducedMotion));
		shown.rerender(dock("listening", reducedMotion));
		shown.unmount();
	});
}

/**
 * Move the voice to the box and back, in a dock that has the voice at its head.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns How many animations were played.
 */
const moved = (reducedMotion: boolean): number =>
	animationsWhile(() => {
		subtitlePreference.change(false);
		const shown = render(dock("listening", reducedMotion, true));
		act(() => {
			subtitlePreference.change(true);
		});
		act(() => {
			subtitlePreference.change(false);
		});
		shown.unmount();
	});

test("the dock glides between its layouts, and cuts for a person who asked for no motion", () => {
	expect(animationsWhenVoiceStarts(false)).toBeGreaterThan(0);
	expect(animationsWhenVoiceStarts(true)).toBe(0);
});

/**
 * The dock's root.
 * @param container What the dock is drawn in.
 * @returns It.
 */
function rootOf(container: HTMLElement): Element | null {
	return container.querySelector('[data-slot="agent-dock"]');
}

/**
 * The voice control.
 * @param container What the dock is drawn in.
 * @returns It.
 */
function keyOf(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('[data-slot="voice-circle"]');
}

test("while a voice box is on the page the dock is calm and its key ends voice", () => {
	const shown = render(dock("listening", true, true));
	const key = keyOf(shown.container);
	expect(rootOf(shown.container)?.getAttribute("data-live")).toBe("false");
	expect(key?.getAttribute("data-form")).toBe("key");
	expect(key?.getAttribute("aria-label")).toBe("End voice");
	// Mute and the subtitles control are in the box, not here.
	expect(shown.container.querySelector('[aria-label="Mute"]')).toBeNull();
	expect(shown.container.querySelector('[data-slot="voice-subtitles-toggle"]')).toBeNull();
	// The dock still offers the orb its circle: the orb comes home to it.
	expect(
		shown.container.querySelector('[data-slot="voice-orb-socket"][data-home="dock"]'),
	).not.toBeNull();
});

test("a page with no voice box leaves the voice at the head of the dock, with its controls", () => {
	const shown = render(dock("listening", true, false));
	expect(rootOf(shown.container)?.getAttribute("data-live")).toBe("true");
	expect(keyOf(shown.container)?.getAttribute("data-form")).toBe("circle");
	expect(shown.container.querySelector('[aria-label="Mute"]')).not.toBeNull();
});

test("turning subtitles off puts the voice back at the head of the dock, in the same button", () => {
	const shown = render(dock("listening", true, true));
	const key = keyOf(shown.container);
	act(() => {
		key?.focus();
	});
	expect(document.activeElement).toBe(key);

	act(() => {
		subtitlePreference.change(false);
	});
	expect(rootOf(shown.container)?.getAttribute("data-live")).toBe("true");
	expect(keyOf(shown.container)).toBe(key);
	expect(key?.getAttribute("data-form")).toBe("circle");
	expect(document.activeElement).toBe(key);
	expect(shown.container.querySelector('[aria-label="Mute"]')).not.toBeNull();
	expect(shown.container.querySelector('[data-slot="voice-subtitles-toggle"]')).not.toBeNull();

	act(() => {
		subtitlePreference.change(true);
	});
	expect(rootOf(shown.container)?.getAttribute("data-live")).toBe("false");
	expect(keyOf(shown.container)).toBe(key);
	expect(document.activeElement).toBe(key);
});

test("the dock glides when the voice moves into the box and back, and cuts when asked for no motion", () => {
	expect(moved(false)).toBeGreaterThan(0);
	expect(moved(true)).toBe(0);
});
