import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { act, cleanup, render, screen } = await loadRenderedUiTools();
const { VoiceControls } = await import("../index.js");
const { listeningView, voiceView } = await import("./support/fixtures.js");
const { sessionFake } = await import("./support/session-fake.js");

const theme = readFileSync(path.resolve(import.meta.dirname, "../../theme/app.css"), "utf8");

/** React mints a fresh useId per mount; the identity is not the appearance. */
function withoutIds(markup: string): string {
	return markup.replaceAll(/_r_[0-9a-z]+_/gu, "_id_");
}

function stubReducedMotion(reduce: boolean): () => void {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
	Object.defineProperty(globalThis, "matchMedia", {
		configurable: true,
		writable: true,
		value: (query: string) => ({
			matches: query.includes("prefers-reduced-motion") && reduce,
			media: query,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		}),
	});
	return () => {
		if (descriptor) Object.defineProperty(globalThis, "matchMedia", descriptor);
		else Reflect.deleteProperty(globalThis, "matchMedia");
	};
}

afterEach(() => {
	cleanup();
	delete document.documentElement.dataset.theme;
});
afterAll(unregisterHappyDom);

describe("voice control appearance", () => {
	test("renders identically in both themes, so the tokens do the swapping", () => {
		const restore = stubReducedMotion(false);
		try {
			document.documentElement.dataset.theme = "light";
			const light = render(
				createElement(VoiceControls, { session: sessionFake(listeningView(0.5), 0.5) }),
			);
			const lightMarkup = withoutIds(light.container.innerHTML);
			light.unmount();

			document.documentElement.dataset.theme = "dark";
			const dark = render(
				createElement(VoiceControls, { session: sessionFake(listeningView(0.5), 0.5) }),
			);

			// One tree, one set of semantic classes: the module has no dark branch,
			// which is what keeps the canonical theme the only palette owner.
			expect(withoutIds(dark.container.innerHTML)).toBe(lightMarkup);
		} finally {
			restore();
		}
	});

	test("gives every command the semantic 44px touch target the Flip needs", () => {
		render(createElement(VoiceControls, { session: sessionFake(voiceView("listening")) }));
		const group = screen.getByRole("group", { name: "Voice commands" });
		const buttons = [...group.querySelectorAll<HTMLElement>("[data-voice-command]")];

		expect(buttons.length).toBeGreaterThanOrEqual(3);
		for (const button of buttons) {
			expect(button.className, button.dataset.voiceCommand).toContain("min-h-touch-target");
			expect(button.className, button.dataset.voiceCommand).toContain("px-control-inline");
		}
		// The class is only worth asserting because the token is the Flip's 44px.
		expect(theme).toContain("--arch-size-touch-target: 44px;");
		expect(theme).toContain("--spacing-touch-target: var(--arch-size-touch-target);");
	});

	test("does not open a per-frame level subscription when reduced motion is asked for", () => {
		const restore = stubReducedMotion(true);
		try {
			const fake = sessionFake(listeningView(0.6), 0.6);
			render(createElement(VoiceControls, { session: fake }));

			// The meter is the only animated thing here, and it is supplemental: the
			// named status stays, and no animation-frame channel is subscribed at all.
			expect(document.querySelector("[data-voice-meter]")).toBeNull();
			expect(fake.levelListeners()).toBe(0);
			expect(screen.getByLabelText("Live voice").textContent).toContain("Listening");
		} finally {
			restore();
		}
	});

	test("runs the meter when motion is allowed and drops it the moment voice stops", async () => {
		const restore = stubReducedMotion(false);
		try {
			const fake = sessionFake(listeningView(0.6), 0.6);
			render(createElement(VoiceControls, { session: fake }));
			expect(document.querySelector("[data-voice-meter]")).not.toBeNull();
			expect(fake.levelListeners()).toBe(1);

			await act(async () => fake.publish(voiceView("stopped")));

			// Nothing animates after a stop, and the level channel is released with
			// the meter that was reading it.
			expect(document.querySelector("[data-voice-meter]")).toBeNull();
			expect(fake.levelListeners()).toBe(0);

			await act(async () => fake.publish(voiceView("terminal_failure")));
			expect(document.querySelector("[data-voice-meter]")).toBeNull();
			expect(fake.levelListeners()).toBe(0);
		} finally {
			restore();
		}
	});

	test("takes its motion durations from the theme rather than declaring its own", () => {
		const restore = stubReducedMotion(false);
		try {
			render(createElement(VoiceControls, { session: sessionFake(listeningView(0.3), 0.3) }));
			const segment = document.querySelector<HTMLElement>("[data-voice-meter-segment]");

			expect(segment?.className).toContain("duration-control");
			expect(segment?.className).toContain("ease-control");
			// The canonical theme is the only owner of what those names mean, and it
			// collapses them under the same preference this module reads.
			expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
			expect(theme).toContain("--arch-duration-control: 0.001ms;");
		} finally {
			restore();
		}
	});
});
