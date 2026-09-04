import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, StrictMode } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { act, cleanup, render, screen, userEvent } = await loadRenderedUiTools();
const { VoiceControls } = await import("../index.js");
const { listeningView, replacedView, voiceView } = await import("./support/fixtures.js");
const { sessionFake } = await import("./support/session-fake.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

const THEME_PATH = path.resolve(import.meta.dirname, "../../theme/app.css");

type Fake = ReturnType<typeof sessionFake>;

function mount(fake: Fake): void {
	render(createElement(VoiceControls, { session: fake }));
}

function command(name: string): HTMLElement {
	const group = screen.getByRole("group", { name: "Voice commands" });
	const button = group.querySelector<HTMLElement>(`[data-voice-command="${name}"]`);
	if (button === null) throw new Error(`No ${name} command is rendered.`);
	return button;
}

/** Base UI renders a refused command with both a disabled and a data-disabled. */
function refused(name: string): boolean {
	const button = command(name);
	return (button as HTMLButtonElement).disabled && button.hasAttribute("data-disabled");
}

function reason(name: string): string | null {
	const described = command(name).getAttribute("aria-describedby");
	if (described === null) return null;
	return document.getElementById(described)?.textContent ?? null;
}

describe("voice control commands", () => {
	test("emits one adapter command per pointer press and nothing else", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("ready"));
		mount(fake);

		await user.click(command("start"));

		expect(fake.calls()).toEqual(["start"]);
		await act(async () => fake.settle(listeningView(0)));

		await user.click(command("mute"));
		expect(fake.calls()).toEqual(["start", "mute"]);
		await act(async () => fake.settle(voiceView("muted")));

		await user.click(command("unmute"));
		expect(fake.calls()).toEqual(["start", "mute", "unmute"]);
		await act(async () => fake.settle(listeningView(0)));

		await user.click(command("stop"));
		expect(fake.calls()).toEqual(["start", "mute", "unmute", "stop"]);
	});

	test("activates from the keyboard and shows where the focus is", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("ready"));
		mount(fake);

		await user.tab();

		const start = command("start");
		expect(document.activeElement).toBe(start);
		// A focused control must be visibly focused, not merely reachable.
		expect(start.className).toContain("focus-visible:outline-2");
		expect(start.className).toContain("focus-visible:outline-ring");

		await user.keyboard("{Enter}");
		expect(fake.calls()).toEqual(["start"]);
		await act(async () => fake.settle(listeningView(0)));

		command("mute").focus();
		await user.keyboard(" ");
		expect(fake.calls()).toEqual(["start", "mute"]);
	});

	test("activates from a touch tap on a Samsung Flip sized target", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("ready"));
		mount(fake);
		const start = command("start");

		// The semantic 44px target is what makes every control usable on the Flip,
		// and the class is only worth asserting because the token is that 44px.
		for (const button of screen
			.getByRole("group", { name: "Voice commands" })
			.querySelectorAll<HTMLElement>("[data-voice-command]"))
			expect(button.className, button.dataset.voiceCommand).toContain("min-h-touch-target");
		expect(readFileSync(THEME_PATH, "utf8")).toContain("--arch-size-touch-target: 44px;");

		await user.pointer([
			{ keys: "[TouchA>]", target: start },
			{ keys: "[/TouchA]", target: start },
		]);

		expect(fake.calls()).toEqual(["start"]);
	});

	test("disables every control while one command is unsettled and says what is running", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("ready"));
		mount(fake);

		await user.click(command("start"));

		expect(fake.unsettled()).toBe(1);
		for (const name of ["start", "mute", "stop"]) {
			expect(refused(name), name).toBe(true);
			expect(reason(name), name).toBe(
				"Voice is starting. Wait for it to finish before pressing again.",
			);
		}

		// A repeated press while the first is in flight reaches nothing.
		await user.click(command("start"));
		expect(fake.calls()).toEqual(["start"]);

		await act(async () => fake.settle(listeningView(0)));

		expect(refused("stop")).toBe(false);
		expect(reason("stop")).toBeNull();
	});

	test("keeps an unavailable control refused with the reason the workbench gave", () => {
		const fake = sessionFake(voiceView("unavailable"));
		mount(fake);

		expect(refused("start")).toBe(true);
		expect(reason("start")).toBe("The Codex workbench connection dropped.");
		expect(reason("mute")).toBe("Mute is available while voice is listening.");
		expect(reason("stop")).toBe("There is no running voice session to stop.");
		expect(fake.calls()).toEqual([]);
	});

	test("recovers from a retryable failure through the offered control only", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("retryable_failure"));
		mount(fake);

		const status = screen.getByRole("alert");
		expect(status.textContent).toContain("The realtime audio connection was lost.");
		expect(command("restart").textContent).toBe("Restart voice");

		await user.click(command("restart"));

		// The module chose no recovery: it pressed exactly the control the adapter
		// offered, and nothing before the person did.
		expect(fake.calls()).toEqual(["restart"]);
		await act(async () => fake.settle(listeningView(0)));
		expect(screen.queryByRole("alert")).toBeNull();
	});

	test("offers close, and only close, on a replaced session", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(replacedView());
		mount(fake);

		expect(refused("start")).toBe(true);
		expect(refused("stop")).toBe(true);
		expect(refused("close")).toBe(false);

		await user.click(command("close"));

		expect(fake.calls()).toEqual(["close"]);
	});

	test("releases its subscriptions on unmount and ignores a command that lands after", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(listeningView(0.4));
		const view = render(createElement(VoiceControls, { session: fake }));
		expect(fake.statusListeners()).toBe(1);
		expect(fake.levelListeners()).toBe(1);

		await user.click(command("stop"));
		view.unmount();

		expect(fake.statusListeners()).toBe(0);
		expect(fake.levelListeners()).toBe(0);
		// The promise this control started resolves after it is gone. Nothing may
		// write to it, and the adapter it read is not disposed here: the caller
		// that constructed the session owns that.
		await act(async () => fake.settle(voiceView("stopped")));
		expect(fake.disposeCount()).toBe(0);
		expect(fake.calls()).toEqual(["stop"]);
	});
	test("stays usable after a remount, so a settled command re-enables it", async () => {
		const user = userEvent.setup();
		const fake = sessionFake(voiceView("ready"));
		// StrictMode mounts, unmounts, and mounts the same instance again. A flag
		// set once at construction would be false for the life of that instance.
		render(createElement(StrictMode, null, createElement(VoiceControls, { session: fake })));

		await user.click(command("start"));
		expect(refused("start")).toBe(true);

		await act(async () => fake.settle(listeningView(0)));

		expect(refused("stop")).toBe(false);
		expect(reason("stop")).toBeNull();
	});
});
