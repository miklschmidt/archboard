// Startup, failure and disposal leave one complete picture and no orphan painter.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import { PICTURE_MS } from "@archboard/timing";

/** Every call the painter took, by name. */
const taken: string[] = [];

/** How a painter's start ends. */
type Outcome = "cpu" | "gpu" | "failed";

/** Startup and failure are controlled at the painter boundary. */
const starting: { settle?: (outcome: Outcome) => void; failCall?: string } = {};
const painter = new Proxy(
	{},
	{
		/**
		 * Record the call or fail it once.
		 * @param _painter The painter.
		 * @param call The method name.
		 * @returns The method.
		 */
		get(_painter, call) {
			return (): boolean => {
				taken.push(String(call));
				if (starting.failCall === call) {
					delete starting.failCall;
					throw new Error("painter failed");
				}
				return false;
			};
		},
	},
);

await mock.module("@archboard/renderer/browser", () => ({
	/**
	 * Start only when the test allows it, on a fresh canvas after GPU failure.
	 * @param canvas The canvas.
	 * @param _dark The theme.
	 * @param failure The GPU failure, if any.
	 * @returns The started painter.
	 */
	startPainter: (canvas: HTMLCanvasElement, _dark: boolean, failure?: string) =>
		new Promise((resolve, reject) => {
			/**
			 * Finish startup with the chosen outcome.
			 * @param outcome How startup ends.
			 */
			starting.settle = (outcome): void => {
				if (outcome === "failed") {
					reject(new Error("no painter"));
					return;
				}
				let next = canvas;
				if (failure !== undefined) {
					next = document.createElement("canvas");
					canvas.replaceWith(next);
				}
				resolve({ painter, canvas: next, kind: outcome, reason: failure ?? null });
			};
		}),
}));

const { attachStage, stageOf } =
	await import("#ui/clients/semantic-board-canvas/picture/picture-stage.ts");
const NOWHERE = { x: 0, y: 0 };
const SVG =
	'<svg><defs><path id="glyph"/></defs><g data-semantic-id="card"><rect/><g aria-hidden="true"><use href="#glyph"/></g><text fill="transparent">Card</text></g></svg>';
const leave: (() => void)[] = [];
let clock = createSteppedClock(0);

beforeAll(() => {
	GlobalRegistrator.register();
});
beforeEach(() => {
	taken.length = 0;
	delete starting.failCall;
	delete starting.settle;
	clock = createSteppedClock(0);
	leave.push(driveFramesFrom(clock));
});
afterEach(() => {
	for (const detach of leave.splice(0).toReversed()) detach();
	document.body.replaceChildren();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Flush the asynchronous module and painter startup at their promise boundaries.
 * @returns After startup can settle.
 */
async function flushStartup(): Promise<void> {
	await import("@archboard/renderer/browser");
	await Promise.resolve();
	await Promise.resolve();
}

/**
 * Put a picture on a stage and request its painter.
 * @returns The surface and canvas host.
 */
async function surfaceWithAPicture() {
	const surface = document.createElement("div");
	const host = document.createElement("div");
	const pane = document.createElement("div");
	pane.append(host, surface);
	document.body.append(pane);
	surface.innerHTML = SVG;
	leave.push(attachStage(surface, host));
	stageOf(surface)?.enter("{}", null, NOWHERE);
	await flushStartup();
	return { surface, host, original: surface.innerHTML };
}

/**
 * Finish startup and draw its first frame.
 * @param outcome The painter that starts.
 * @returns After startup and the frame.
 */
async function start(outcome: Outcome): Promise<void> {
	starting.settle?.(outcome);
	await flushStartup();
	clock.runFrame();
}

test("a painter that starts in time brings the first picture in before hiding SVG ink", async () => {
	const { surface } = await surfaceWithAPicture();
	expect(surface.hasAttribute("data-ink-waits")).toBe(true);
	await start("cpu");
	expect(taken).toContain("enter");
	expect(taken).not.toContain("show");
	expect(surface.getAttribute("data-painter")).toBe("cpu");
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	expect(surface.querySelector("use")).toBeNull();
	expect(surface.querySelector("text")?.textContent).toBe("Card");
});

test("a late painter takes the picture as it stands", async () => {
	const { surface } = await surfaceWithAPicture();
	clock.advanceTo(PICTURE_MS.painterGrace);
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	await start("cpu");
	expect(taken).toContain("show");
	expect(taken).not.toContain("enter");
});

test("a failed start leaves complete SVG ink and an inspectable reason", async () => {
	const { surface, original } = await surfaceWithAPicture();
	await start("failed");
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	expect(surface.hasAttribute("data-painter")).toBe(false);
	expect(surface.hasAttribute("data-painter-reason")).toBe(true);
	expect(surface.innerHTML).toBe(original);
});

test.each(["frame", "resize", "setFar"])(
	"%s failure restores complete ink and keeps the semantic groups",
	async (failedCall) => {
		const { surface, host, original } = await surfaceWithAPicture();
		const group = surface.querySelector("[data-semantic-id]");
		await start("cpu");
		starting.failCall = failedCall;
		Object.defineProperty(host.firstChild, "clientWidth", { value: 2 });
		stageOf(surface)?.setFar(true, 0);
		clock.runFrame();
		expect(taken.filter((call) => call === "free")).toHaveLength(1);
		expect(surface.hasAttribute("data-painter")).toBe(false);
		expect(surface.innerHTML).toBe(original);
		expect(surface.querySelector("[data-semantic-id]")).toBe(group);
		expect(host.querySelector("canvas")?.style.visibility).toBe("hidden");
	},
);

test("GPU failure waits for CPU replacement and disposal removes the replacement canvas", async () => {
	const { surface, host } = await surfaceWithAPicture();
	await start("gpu");
	const original = host.firstChild;
	starting.failCall = "frame";
	stageOf(surface)?.setFar(true, 0);
	clock.runFrame();
	expect(stageOf(surface)?.starting).toBe(true);
	expect(surface.querySelector("use")).not.toBeNull();
	await flushStartup();
	await start("cpu");
	expect(host.firstChild).not.toBe(original);
	expect(surface.getAttribute("data-painter")).toBe("cpu");
	leave.pop()?.();
	expect(host.childNodes.length).toBe(0);
	expect(taken.filter((call) => call === "free")).toHaveLength(2);
});

test("CPU replacement failure is handled and leaves the full SVG visible", async () => {
	const { surface, original } = await surfaceWithAPicture();
	await start("gpu");
	starting.failCall = "frame";
	stageOf(surface)?.setFar(true, 0);
	clock.runFrame();
	await flushStartup();
	await start("failed");
	expect(stageOf(surface)?.starting).toBe(false);
	expect(surface.innerHTML).toBe(original);
	expect(surface.hasAttribute("data-painter")).toBe(false);
});

test("a cut during startup cancels the pending entrance", async () => {
	const { surface } = await surfaceWithAPicture();
	stageOf(surface)?.show("next");
	await start("cpu");
	expect(taken).toContain("show");
	expect(taken).not.toContain("enter");
});

test("clearing a picture hides stale canvas ink at once", async () => {
	const { surface, host } = await surfaceWithAPicture();
	await start("cpu");
	stageOf(surface)?.show(undefined);
	expect(host.querySelector("canvas")?.style.visibility).toBe("hidden");
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	expect(surface.hasAttribute("data-painter")).toBe(false);
});

test("a painter that finishes startup after disposal is freed", async () => {
	const { surface } = await surfaceWithAPicture();
	leave.pop()?.();
	await start("cpu");
	expect(taken).toEqual(["free"]);
	expect(surface.hasAttribute("data-painter")).toBe(false);
});

test("holding traffic during startup reaches the painter before its first frame", async () => {
	const { surface } = await surfaceWithAPicture();
	stageOf(surface)?.holdTraffic();
	await start("cpu");
	expect(taken).toContain("holdTraffic");
	expect(taken.indexOf("holdTraffic")).toBeLessThan(taken.indexOf("frame"));
});

test("failure during the initial briefing frees the painter and leaves SVG ink", async () => {
	const { surface, original } = await surfaceWithAPicture();
	starting.failCall = "enter";
	await start("cpu");
	expect(taken.filter((call) => call === "free")).toHaveLength(1);
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	expect(surface.innerHTML).toBe(original);
});

test("recovery restores the current picture after another picture was thinned off the page", async () => {
	const { surface } = await surfaceWithAPicture();
	await start("cpu");
	const made = document.createElement("div");
	made.innerHTML = SVG.replace("Card", "Next");
	const original = made.innerHTML;
	stageOf(surface)?.thin(made);
	surface.replaceChildren(...made.childNodes);
	stageOf(surface)?.learnGroups(surface);
	stageOf(surface)?.show("next");
	clock.runFrame();
	starting.failCall = "frame";
	stageOf(surface)?.setFar(true, 0);
	clock.runFrame();
	expect(surface.innerHTML).toBe(original);
	expect(surface.querySelectorAll("defs").length).toBe(1);
});
