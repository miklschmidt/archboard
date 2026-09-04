import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { act, cleanup, render, screen } = await loadRenderedUiTools();
const { VoiceControls } = await import("../index.js");
const { listeningView, voiceView } = await import("./support/fixtures.js");
const { sessionFake } = await import("./support/session-fake.js");

const moduleRoot = path.resolve(import.meta.dirname, "..");
const theme = readFileSync(path.resolve(moduleRoot, "../theme/app.css"), "utf8");

/** Every authored source the module ships, tests excluded. */
function productSources(): readonly string[] {
	return readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				[".ts", ".tsx"].includes(path.extname(entry.name)) &&
				!path.relative(moduleRoot, entry.parentPath).startsWith("tests"),
		)
		.map((entry) => path.join(entry.parentPath, entry.name));
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
	test("owns no second palette: no module-owned dark variant anywhere", () => {
		const offenders: string[] = [];
		for (const file of productSources()) {
			const source = readFileSync(file, "utf8");
			// The canonical theme swaps the palette under :root[data-theme="dark"]. A
			// `dark:` variant, a prefers-color-scheme query, or a theme read in a
			// component would be the second say in the palette the guide forbids.
			for (const pattern of [/\bdark:/u, /prefers-color-scheme/u, /data-theme/u])
				if (pattern.test(source)) offenders.push(`${path.basename(file)}: ${pattern.source}`);
		}
		expect(offenders, offenders.join("\n")).toEqual([]);
		// The check is only worth anything because the theme really does the swap.
		expect(theme).toContain(':root[data-theme="dark"] {');
		expect(/\bdark:/u.test("hover:dark:bg-surface")).toBe(true);
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
