// What a stage does while its painter starts: a first picture waits a moment for
// the painter, and a reader gets a correct board whatever the painter does.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";

/** Every call the painter took, by name. */
const taken: string[] = [];

/** How a painter's start ends. */
type Outcome = "started" | "failed";

/** The painter that starts, in the test's hands. */
const starting: { settle?: (outcome: Outcome) => void } = {};

const painter = new Proxy(
	{},
	{
		/**
		 * Take any call.
		 * @param _painter The painter.
		 * @param call The call's name.
		 * @returns What takes the call.
		 */
		get(_painter, call) {
			return (): boolean => {
				taken.push(String(call));
				return false;
			};
		},
	},
);

await mock.module("@archboard/renderer/browser", () => ({
	/**
	 * A painter that starts when the test says.
	 * @param canvas The canvas it paints.
	 * @returns The painter at work.
	 */
	startPainter: (canvas: HTMLCanvasElement) =>
		new Promise((resolve, reject) => {
			/**
			 * End the start.
			 * @param outcome How it ends.
			 */
			starting.settle = (outcome): void => {
				if (outcome === "failed") reject(new Error("no painter"));
				else resolve({ painter, canvas, kind: "cpu", reason: null });
			};
		}),
}));

const { attachStage, stageOf } =
	await import("#ui/clients/semantic-board-canvas/picture/picture-stage.ts");

const NOWHERE = { x: 0, y: 0 };

/**
 * A surface with a stage, a picture coming in, and its painter asked for.
 * @returns The surface.
 */
async function surfaceWithAPicture(): Promise<HTMLElement> {
	taken.length = 0;
	const surface = document.createElement("div");
	const pane = document.createElement("div");
	pane.append(surface);
	document.body.append(pane);
	const detach = attachStage(surface, document.createElement("canvas"));
	leave.push(detach);
	stageOf(surface)?.enter("{}", null, NOWHERE);
	await Bun.sleep(1);
	return surface;
}

/** What each test leaves behind. */
const leave: (() => void)[] = [];

beforeAll(() => {
	GlobalRegistrator.register();
});

afterEach(() => {
	for (const detach of leave.splice(0)) detach();
	mock.restore();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Let the painter's start go through, and draw the frame it asked for.
 * @returns After the frame.
 */
async function drawFirstFrame(): Promise<void> {
	await Bun.sleep(1);
	await new Promise(requestAnimationFrame);
	await Bun.sleep(1);
}

test("a painter that starts in time brings the first picture in, and only then does the ink go", async () => {
	const surface = await surfaceWithAPicture();
	expect(surface.hasAttribute("data-ink-waits")).toBe(true);

	starting.settle?.("started");
	await drawFirstFrame();

	expect(taken).toContain("enter");
	expect(taken).not.toContain("show");
	expect(surface.getAttribute("data-painter")).toBe("cpu");
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
});

test("a painter that starts late finds the SVG standing, and takes the picture as it stands", async () => {
	const timers = spyOn(window, "setTimeout");
	const surface = await surfaceWithAPicture();
	timers.mock.calls.at(-1)?.[0]();
	expect(surface.hasAttribute("data-ink-waits")).toBe(false);

	starting.settle?.("started");
	await drawFirstFrame();

	expect(taken).toContain("show");
	expect(taken).not.toContain("enter");
});

test("a painter that fails leaves the SVG, and the surface says why", async () => {
	const surface = await surfaceWithAPicture();

	starting.settle?.("failed");
	await Bun.sleep(1);

	expect(surface.hasAttribute("data-ink-waits")).toBe(false);
	expect(surface.hasAttribute("data-painter")).toBe(false);
	expect(surface.getAttribute("data-painter-reason")).toContain("no painter");
});
