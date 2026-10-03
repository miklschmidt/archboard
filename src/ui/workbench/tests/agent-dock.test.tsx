// The agent dock's voice control is one button while voice is off and while it
// is on. Pressing Talk must not swap the control for another, because the dock
// moves it between its shapes and a person who pressed it by keyboard keeps their
// place on it.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { JSX } from "react";

import type { AgentSetupSnapshot } from "@/ui/agent-setup";
import { AgentDock } from "@/ui/workbench";
import type { AgentActions, AgentView, AgentVoiceView } from "@/ui/workbench/contracts";

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

/** Actions that do nothing, for a dock nobody presses. */
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

const READY: AgentSetupSnapshot = {
	phase: { kind: "ready", linked: true },
	held: [],
	talk: "idle",
	step: null,
	failure: null,
	talkFailure: null,
};

/** A voice that makes no sound. */
const SILENT: AgentVoiceView["level"] = {
	/**
	 * The level of a voice that is not on.
	 * @returns Silence.
	 */
	read: () => 0,
	/**
	 * Nothing to hear.
	 * @returns How to stop hearing nothing.
	 */
	subscribe: () => () => undefined,
};

/**
 * A ready agent with nothing to say, and a voice in a stage.
 * @param stage The voice's stage.
 * @returns The view.
 */
function viewWith(stage: AgentVoiceView["stage"]): AgentView {
	return {
		setup: READY,
		snapshot: null,
		conversation: { snapshot: null, turns: [], failure: null },
		voice: { stage, problem: null, busy: false, level: SILENT },
		context: { board: "payments", state: null },
		busyApprovals: [],
		approvalErrors: {},
		lastProgressAtMs: null,
	};
}

/**
 * The dock, in a voice stage.
 * @param stage The voice's stage.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns The dock, drawn.
 */
function dock(stage: AgentVoiceView["stage"], reducedMotion = true): JSX.Element {
	return (
		<AgentDock
			view={viewWith(stage)}
			actions={IDLE_ACTIONS}
			panelOpen={false}
			unread={false}
			onTogglePanel={nothing}
			reducedMotion={reducedMotion}
		/>
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
 * Count the animations the dock asks for while voice starts.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns How many animations were played.
 */
function animationsWhenVoiceStarts(reducedMotion: boolean): number {
	played.count = 0;
	animateKept = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
	Object.defineProperty(HTMLElement.prototype, "animate", {
		configurable: true,
		writable: true,
		value: countAnimation,
	});
	const shown = render(dock("idle", reducedMotion));
	shown.rerender(dock("listening", reducedMotion));
	shown.unmount();
	return played.count;
}

test("the dock glides between its layouts, and cuts for a person who asked for no motion", () => {
	expect(animationsWhenVoiceStarts(false)).toBeGreaterThan(0);
	expect(animationsWhenVoiceStarts(true)).toBe(0);
});
