// The voice key of a fullscreen presentation's bar: Talk while voice is off, End voice once it connects.
//
// What is guarded: the key is always there, starts voice from rest, and ends it from the moment it
// connects, so a session stuck connecting can always be ended; while voice is on its way to connecting it
// says so and cannot be pressed twice; and when voice cannot start it says why beside the key that retries.
// Voice itself, its words, mute and subtitles, are not in the bar (the voice box carries them).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
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
	expect(button.textContent).toContain("Talk");
	fireEvent.click(button);
	expect(pressed).toEqual(["talk"]);
});

test("voice is ended from the key from the moment it connects, whatever it is doing", () => {
	for (const stage of ["connecting", "listening", "speaking", "muted"] as const) {
		const { button, pressed } = key(voiceIn(stage));
		expect(button.textContent).toContain("End voice");
		fireEvent.click(button);
		expect(pressed).toEqual(["endVoice"]);
		cleanup();
	}
});

test("while voice is starting or ending the key says so and cannot be pressed", () => {
	for (const stage of ["preparing", "stopping"] as const) {
		const { button, pressed } = key(voiceIn(stage));
		expect(button.hasAttribute("disabled")).toBe(true);
		fireEvent.click(button);
		expect(pressed).toEqual([]);
		cleanup();
	}
});

test("a voice that cannot start says why beside the key that retries", () => {
	const { button } = key({ ...voiceIn("idle"), problem: "Sign in to talk." });
	const why = document.getElementById(button.getAttribute("aria-describedby") ?? "");
	expect(why?.textContent).toBe("Sign in to talk.");
	expect(button.hasAttribute("disabled")).toBe(false);
});
