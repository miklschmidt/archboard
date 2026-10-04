// Driving the real shell in a private headless Chromium, and filming what it paints.
//
// The browser is the product's own (src/runtime/headless-chromium, ADR 0020): its own process
// group, a private profile, loopback DevTools only, and a teardown with proof. What the
// walkthrough recorder cannot do is here: a take acts like a person (it moves a pointer, hovers,
// double-clicks, types and presses keys) while the server redraws on CLI writes, so it is filmed
// in real time with Chromium's screencast rather than drawn frame by frame from a recorded talk.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	isJsonRecord,
	launchHeadlessChromium,
	type DevTools,
	type HeadlessChromium,
	type JsonRecord,
} from "@/runtime/headless-chromium";
import { SHELL_VIEWPORT } from "@/shared/shell-geometry";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { chromiumPath } from "./tools.ts";

/** How long a DevTools call or a page evaluation may take. */
const CALL_MS = 20_000;

/** How often a wait looks at the page again. */
const POLL_MS = 100;

/** A point on the page, in CSS pixels. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/** One painted frame, saved, and the wall-clock second it was painted at. */
interface Frame {
	readonly file: string;
	readonly at: number;
}

/**
 * What the screencast of one window saved. A frame can be larger than the page: presenting a pane
 * fullscreen grows the window to the screen, and the page then sits in its top-left corner.
 */
interface Footage {
	readonly directory: string;
	readonly frames: readonly Frame[];
	/** The page's size, which every frame is cut to. */
	readonly width: number;
	readonly height: number;
}

/** How a window opens. */
interface WindowOptions {
	readonly url: string;
	readonly theme: "light" | "dark";
	/** The page's size; the shell's reference viewport when absent. */
	readonly width?: number;
	readonly height?: number;
	/** Draw a dot that follows the pointer, since a headless screenshot shows no cursor. */
	readonly cursor?: boolean;
}

/** The page script that draws the pointer, inside the presented element when there is one. */
const CURSOR_SCRIPT = `(() => {
	const install = () => {
		const dot = document.createElement("div");
		Object.assign(dot.style, {
			position: "fixed", left: "0", top: "0", width: "22px", height: "22px",
			marginLeft: "-11px", marginTop: "-11px", borderRadius: "50%",
			background: "rgba(40,90,255,0.28)", border: "2px solid rgba(40,90,255,0.9)",
			boxShadow: "0 1px 6px rgba(0,0,0,0.25)", pointerEvents: "none",
			zIndex: "2147483647", transition: "transform 90ms ease-out, opacity 220ms ease", opacity: "0",
		});
		let x = 0, y = 0, pressed = false, idle;
		const place = () => { dot.style.transform = "translate(" + x + "px," + y + "px) scale(" + (pressed ? 0.78 : 1) + ")"; };
		const wake = () => { dot.style.opacity = "1"; clearTimeout(idle); idle = setTimeout(() => { if (!pressed) dot.style.opacity = "0"; }, 900); };
		const host = () => (document.fullscreenElement || document.documentElement).appendChild(dot);
		host();
		document.addEventListener("fullscreenchange", host);
		window.addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; place(); wake(); }, true);
		window.addEventListener("pointerdown", (e) => { x = e.clientX; y = e.clientY; pressed = true; place(); wake(); }, true);
		window.addEventListener("pointerup", () => { pressed = false; place(); wake(); }, true);
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();`;

/** Keys a take presses, with the codes Chromium needs for them. */
const KEYS: Readonly<Record<string, { readonly code: string; readonly keyCode: number }>> = {
	Enter: { code: "Enter", keyCode: 13 },
	"0": { code: "Digit0", keyCode: 48 },
	F: { code: "KeyF", keyCode: 70 },
};

/** The modifier bits of a DevTools key event. */
const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

/**
 * An expression that is true once the nth board stage's picture is drawn and still: no picture
 * in flight and no camera gliding.
 * @param nth Which stage, counted from nought.
 * @returns The expression.
 */
function atRestExpression(nth: number): string {
	return `(() => {
		const stage = document.querySelectorAll("[data-slot='semantic-board-stage']")[${nth}];
		if (!stage || stage.getAttribute("data-state") !== "drawn") return false;
		const surface = stage.querySelector("[data-slot='semantic-board-surface']");
		return !!surface && !!surface.querySelector("svg") && !surface.hasAttribute("data-picture-motion") && !surface.hasAttribute("data-camera-motion");
	})()`;
}

/** One window's page. */
class Page {
	readonly devtools: DevTools;
	readonly width: number;
	readonly height: number;
	#pointer: Point = { x: 0, y: 0 };

	/**
	 * A page a browser opened.
	 * @param devtools The connection to it.
	 * @param size The page's size, in CSS pixels.
	 * @param size.width Its width.
	 * @param size.height Its height.
	 */
	constructor(devtools: DevTools, size: { readonly width: number; readonly height: number }) {
		this.devtools = devtools;
		this.width = size.width;
		this.height = size.height;
	}

	/**
	 * Evaluate an expression on the page.
	 * @param expression The expression.
	 * @returns Its value.
	 */
	async evaluate(expression: string): Promise<unknown> {
		return this.devtools.evaluate(expression, { timeoutMs: CALL_MS });
	}

	/**
	 * Wait until an expression is truthy on the page.
	 * @param expression The expression.
	 * @param label What is waited for, for the failure.
	 * @param timeoutMs How long to wait.
	 * @returns The expression's value.
	 * @throws {Error} When it is not truthy in time.
	 */
	async waitFor(expression: string, label: string, timeoutMs = CALL_MS): Promise<unknown> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			// oxlint-disable-next-line no-await-in-loop -- each look waits for the answer of the one before
			const value = await this.evaluate(expression).catch(() => undefined);
			if (value) return value;
			if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
			// oxlint-disable-next-line no-await-in-loop -- a poll waits between looks
			await Bun.sleep(POLL_MS);
		}
	}

	/**
	 * Wait until a board stage's picture is drawn and still, and its fonts are ready.
	 * @param nth Which stage, counted from nought.
	 */
	async atRest(nth = 0): Promise<void> {
		await this.waitFor(atRestExpression(nth), `board stage ${nth} at rest`);
		await this.evaluate(
			"document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))",
		);
	}

	/**
	 * The centre of the first element a selector matches.
	 * @param selector The selector.
	 * @returns The point.
	 * @throws {Error} When nothing matches.
	 */
	async centreOf(selector: string): Promise<Point> {
		const at = await this
			.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)});
			if (!element) return null; const box = element.getBoundingClientRect();
			return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }; })()`);
		if (typeof at !== "object" || at === null || !("x" in at) || !("y" in at)) {
			throw new Error(`Nothing on the page matches ${selector}.`);
		}
		return { x: Number(at.x), y: Number(at.y) };
	}

	/**
	 * Move the pointer in a straight line, in steps a person's hand would take.
	 * @param to Where it goes.
	 * @param steps How many moves it takes.
	 */
	async moveTo(to: Point, steps = 24): Promise<void> {
		const from = this.#pointer;
		for (let step = 1; step <= steps; step++) {
			const x = from.x + ((to.x - from.x) * step) / steps;
			const y = from.y + ((to.y - from.y) * step) / steps;
			// oxlint-disable-next-line no-await-in-loop -- a pointer path is one move after another
			await this.#mouse("mouseMoved", { x, y }, 0);
			// oxlint-disable-next-line no-await-in-loop -- the moves are spread over time, as a hand's are
			if (steps > 1) await Bun.sleep(16);
		}
		this.#pointer = to;
	}

	/**
	 * Move to an element and press it, holding the button for a moment.
	 * @param selector The element.
	 * @param holdMs How long the button stays down.
	 */
	async click(selector: string, holdMs = 0): Promise<void> {
		const at = await this.centreOf(selector);
		await this.moveTo(at);
		await this.#mouse("mousePressed", at, 1);
		if (holdMs > 0) await Bun.sleep(holdMs);
		await this.#mouse("mouseReleased", at, 1);
	}

	/**
	 * Move to an element and double-click it.
	 * @param selector The element.
	 */
	async doubleClick(selector: string): Promise<void> {
		const at = await this.centreOf(selector);
		await this.moveTo(at);
		for (const clickCount of [1, 2]) {
			// oxlint-disable-next-line no-await-in-loop -- the second click follows the first
			await this.#mouse("mousePressed", at, clickCount);
			// oxlint-disable-next-line no-await-in-loop -- a release follows its press
			await this.#mouse("mouseReleased", at, clickCount);
		}
	}

	/**
	 * Press one key.
	 * @param name The key, as KeyboardEvent.key names it.
	 * @param modifiers The modifiers held with it.
	 */
	async key(name: string, modifiers: readonly (keyof typeof MODIFIERS)[] = []): Promise<void> {
		const known = KEYS[name] ?? { code: name, keyCode: 0 };
		const event = {
			key: name,
			code: known.code,
			windowsVirtualKeyCode: known.keyCode,
			modifiers: modifiers.reduce((bits, modifier) => bits | MODIFIERS[modifier], 0),
		};
		await this.devtools.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
		await this.devtools.call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
	}

	/**
	 * Type text one character at a time, as a person types.
	 * @param text The text.
	 */
	async type(text: string): Promise<void> {
		for (const character of text) {
			// oxlint-disable-next-line no-await-in-loop -- characters land in order
			await this.devtools.call("Input.insertText", { text: character });
			// oxlint-disable-next-line no-await-in-loop -- typing takes time
			await Bun.sleep(28);
		}
	}

	/**
	 * The selector of the drawn card whose name is the given words.
	 * @param name The card's name.
	 * @returns A selector that matches only that card.
	 * @throws {Error} When no drawn card has that name.
	 */
	async card(name: string): Promise<string> {
		const id = await this.evaluate(`(() => {
			const cards = [...document.querySelectorAll("[data-slot='semantic-board-surface'] [data-semantic-kind='node'][data-semantic-id]")];
			const first = (card) => card.textContent.split("\\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
			const hit = cards.find((card) => first(card) === ${JSON.stringify(name)}) ?? cards.find((card) => card.textContent.includes(${JSON.stringify(name)}));
			return hit ? hit.getAttribute("data-semantic-id") : null; })()`);
		if (typeof id !== "string") throw new Error(`No drawn card is named ${name}.`);
		return `[data-slot='semantic-board-surface'] [data-semantic-id='${id}']`;
	}

	/**
	 * Save what the page shows as a PNG.
	 * @param path The file.
	 */
	async screenshot(path: string): Promise<void> {
		const shot = await this.devtools.call("Page.captureScreenshot", { format: "png" }, CALL_MS);
		writeFileSync(path, Buffer.from(String(shot["data"]), "base64"));
	}

	/**
	 * Film what the page paints until the returned function is called. Chromium sends a frame only
	 * when the page repaints; each is saved with the second it was painted at.
	 * @param directory Where the frames go.
	 * @returns What stops the filming and hands back the footage.
	 */
	async film(directory: string): Promise<() => Promise<Footage>> {
		mkdirSync(directory, { recursive: true });
		const frames: Frame[] = [];
		const stopHearing = this.devtools.on("Page.screencastFrame", (params: JsonRecord) => {
			const file = join(directory, `f${String(frames.length).padStart(5, "0")}.png`);
			writeFileSync(file, Buffer.from(String(params["data"]), "base64"));
			const metadata = params["metadata"];
			const painted = isJsonRecord(metadata) ? metadata["timestamp"] : undefined;
			frames.push({ file, at: typeof painted === "number" ? painted : now() });
			void this.devtools
				.call("Page.screencastFrameAck", { sessionId: params["sessionId"] })
				.catch(() => undefined);
		});
		await this.devtools.call("Page.startScreencast", {
			format: "png",
			maxWidth: 4000,
			maxHeight: 4000,
			everyNthFrame: 1,
		});
		return async () => {
			await this.devtools.call("Page.stopScreencast", {});
			stopHearing();
			return { directory, frames, width: this.width, height: this.height };
		};
	}

	/**
	 * Dispatch one mouse event.
	 * @param type The event.
	 * @param at Where.
	 * @param clickCount Which click of a run this is.
	 */
	async #mouse(type: string, at: Point, clickCount: number): Promise<void> {
		const button = type === "mouseMoved" ? "none" : "left";
		await this.devtools.call("Input.dispatchMouseEvent", { type, ...at, button, clickCount });
	}
}

/** One private Chromium for one take, with every window it opened. */
class Browser {
	readonly #chromium: HeadlessChromium;

	/**
	 * A started Chromium.
	 * @param chromium The browser.
	 */
	private constructor(chromium: HeadlessChromium) {
		this.#chromium = chromium;
	}

	/**
	 * Start a private Chromium. It composites on the GPU when the machine has one, as a person's
	 * browser does: headless Chromium composites in software otherwise, which stalls glides.
	 * @returns The browser.
	 */
	static async start(): Promise<Browser> {
		const chromium = await launchHeadlessChromium({
			chromiumPath: chromiumPath(),
			extraArgs: [
				// A headless window draws chrome of its own, and element fullscreen grows the window to
				// the screen: the screen is larger than any page, and the page is pinned to its size.
				"--screen-info={3840x2160}",
				"--hide-scrollbars",
				"--force-color-profile=srgb",
				"--autoplay-policy=no-user-gesture-required",
				"--enable-gpu",
				"--disable-gpu-rasterization",
			],
			startupTimeoutMs: CALL_MS,
			cleanupTimeoutMs: 5_000,
			tempRootPrefix: "archboard-readme-",
		});
		return new Browser(chromium);
	}

	/**
	 * Open a window at an exact page size, in the theme asked for, and go to a URL.
	 * @param options The window.
	 * @returns Its page.
	 */
	async open(options: WindowOptions): Promise<Page> {
		const width = options.width ?? SHELL_VIEWPORT.width;
		const height = options.height ?? SHELL_VIEWPORT.height;
		const window = await this.#chromium.openWindow("about:blank", { width, height }, CALL_MS);
		const page = window.page;
		await page.call("Emulation.setDeviceMetricsOverride", {
			width,
			height,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await page.call("Emulation.setEmulatedMedia", {
			features: [
				{ name: "prefers-color-scheme", value: options.theme },
				{ name: "prefers-reduced-motion", value: "no-preference" },
			],
		});
		await page.call("Page.addScriptToEvaluateOnNewDocument", {
			source: `try { localStorage.setItem("archboard.theme", ${JSON.stringify(options.theme)}); } catch {}`,
		});
		if (options.cursor === true) {
			await page.call("Page.addScriptToEvaluateOnNewDocument", { source: CURSOR_SCRIPT });
		}
		await page.call("Page.navigate", { url: options.url });
		return new Page(page, { width, height });
	}

	/** Stop the browser and everything it started. */
	async close(): Promise<void> {
		const cleanup = await this.#chromium.stop();
		if (!cleanup.clean)
			console.error(`Chromium left something behind: ${cleanup.errors.join("; ")}`);
	}
}

/**
 * The wall-clock second now, on the clock the screencast stamps frames with.
 * @returns The second.
 */
function now(): number {
	return Date.now() / 1000;
}

export { Browser, Page, now, type Footage, type Frame };
