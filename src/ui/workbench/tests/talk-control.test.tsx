// The voice key of a fullscreen presentation's bar: Talk while voice is off, End voice once it connects.
//
// What is guarded: the key is always there, starts voice from rest, and ends it from the moment it
// connects, so a session stuck connecting can always be ended; while voice is on its way to connecting it
// says so and cannot be pressed twice; it is one element throughout, so keyboard focus stays on it; and
// when voice cannot start it says why beside the key that retries.
// Voice itself, its words, mute and subtitles, are not in the bar (the voice box carries them).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { TalkControl } from "@/ui/workbench";
import type { AgentVoiceView } from "@/ui/workbench/contracts";
import { recordingActions, voiceIn } from "@/ui/workbench/tests/voice-fixtures";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

afterEach(cleanup);

/**
 * The key in a stage of voice, and what was pressed on it.
 * @param voice The voice.
 * @returns The key and the presses.
 */
function key(voice: AgentVoiceView): { readonly button: HTMLElement; readonly pressed: string[] } {
	const pressed: string[] = [];
	const shown = render(<TalkControl voice={voice} actions={recordingActions(pressed)} />);
	return { button: shown.getByRole("button"), pressed };
}

test("voice is started from the key while it is off", () => {
	const { button, pressed } = key(voiceIn("idle"));
	expect(button.getAttribute("data-voice-controls")).toBe("talk");
	fireEvent.click(button);
	expect(pressed).toEqual(["talk"]);
});

test("voice is ended from the key from the moment it connects, whatever it is doing", () => {
	for (const stage of ["connecting", "listening", "speaking", "muted"] as const) {
		const { button, pressed } = key(voiceIn(stage));
		expect(button.getAttribute("data-voice-controls")).toBe("live");
		fireEvent.click(button);
		expect(pressed).toEqual(["endVoice"]);
		cleanup();
	}
});

test("while voice is starting, ending or on the wire the key presses nothing and stays in the tab order", () => {
	for (const voice of [
		voiceIn("preparing"),
		voiceIn("stopping"),
		voiceIn("listening", true),
		voiceIn("idle", true),
	]) {
		const { button, pressed } = key(voice);
		fireEvent.click(button);
		expect(pressed).toEqual([]);
		expect(button.getAttribute("aria-disabled")).toBe("true");
		// A disabled button would drop the keyboard's place while Talk turns into End voice.
		expect(button.hasAttribute("disabled")).toBe(false);
		cleanup();
	}
});

test("the key that says Talk is the key that says End voice, and keeps the keyboard's place", () => {
	const shown = render(<TalkControl voice={voiceIn("idle")} actions={recordingActions([])} />);
	const button = shown.getByRole("button");
	act(() => {
		button.focus();
	});
	for (const stage of ["preparing", "connecting", "speaking", "stopping", "idle"] as const) {
		shown.rerender(<TalkControl voice={voiceIn(stage)} actions={recordingActions([])} />);
		// One element in every stage: a key swapped for another takes the keyboard's place with it.
		expect(shown.getByRole("button")).toBe(button);
		expect(document.activeElement).toBe(button);
	}
});

test("a voice that cannot start says why beside the key that retries", () => {
	const { button } = key({ ...voiceIn("idle"), problem: "Sign in to talk." });
	const why = document.getElementById(button.getAttribute("aria-describedby") ?? "");
	expect(why?.textContent).toBe("Sign in to talk.");
	expect(button.hasAttribute("disabled")).toBe(false);
});
