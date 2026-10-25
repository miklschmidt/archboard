// Opening a card's board is a flight into the card, and going back is the same
// flight the other way.
//
// What these catch: a board that opens by cutting when it could have flown, a
// flight that ends somewhere other than where the board then stands (it would
// show as a jump the moment the board takes over), a press that falls through
// to the picture under the flight, a flight that leaves a board half open when
// something stops it, and cards that swap their words for their names, or back,
// in the middle of a flight or as the board takes over from it.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { EXPLORING_MS, PICTURE_MS } from "@archboard/timing";
import {
	cameraNow,
	takeFrames,
	type FramesByHand,
} from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	drawing,
	mountStage,
	server,
	settle,
	surface,
	viewport,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/** How big the board below is drawn: larger than the board above, so the flight has something to grow. */
const BELOW = { width: 900, height: 600 };

/**
 * The server's picture of the board below: its own markup, since a picture that
 * is the same as the one on the surface is not a new picture at all.
 * @returns The render route's success body.
 */
function belowPicture(): Record<string, unknown> {
	const body = drawing(1, "engine");
	return { ...body, ...BELOW, svg: String(body["svg"]).replaceAll('"n1"', '"m1"') };
}

/**
 * One board document.
 * @param name What the board is called.
 * @param nodes Its parts.
 * @returns The document.
 */
function boardOf(name: string, nodes: readonly Record<string, unknown>[]): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: name === "pipeline" ? "bd1" : "bd2",
		name,
		level: name === "pipeline" ? "system" : "module",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: { nodes, edges: [] },
			},
		],
	};
}

/** The board above has one card, which opens the board below. */
const ABOVE = boardOf("pipeline", [
	{
		id: "n1",
		name: "board-io",
		kind: "module",
		drillDown: { board: "engine", variant: { kind: "current" } },
	},
]);

/** The board below. */
const BELOW_BOARD = boardOf("engine", [{ id: "m1", name: "atomic-write", kind: "module" }]);

/** The navigator's way to a board; going back along the drill never uses it. */
function open(): void {}

/**
 * The boards above a board, as the navigator would place them.
 * @param name The board on screen.
 * @returns The board above it, when it has one.
 */
function placesAbove(name: string): { name: string; level: string; open: () => void }[] {
	return name === "engine" ? [{ name: "pipeline", level: "system", open }] : [];
}

/** How big a picture is drawn. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/** A board so large that, fitted to the pane, it is seen from far and its cards draw their names. */
const FAR = { width: 4000, height: 3000 };

/** How the pane is set up. */
interface Setup {
	/** Whether the person asked for no motion. */
	readonly reducedMotion?: boolean;
	/** Whether the first picture has finished coming in; it has by default. */
	readonly arrived?: boolean;
	/** How big the board above is drawn, when not its usual size. */
	readonly above?: Size;
	/** How big the board below is drawn, when not its usual size. */
	readonly below?: Size;
}

/**
 * Put both boards in front of a pane that has the board above on screen, with
 * its card picked out, on a clock the test runs by hand.
 * @param setup Whether the person asked for no motion, and whether the first picture has come in.
 * @returns The frames in hand, which the test gives back.
 */
async function aboveOnScreen(setup: Setup = {}): Promise<FramesByHand> {
	const frames = takeFrames();
	server.documents["pipeline"] = ABOVE;
	server.documents["engine"] = BELOW_BOARD;
	server.reply = { status: 200, body: { ...drawing(1), ...setup.above } };
	mountStage("n1", {
		live: true,
		reducedMotion: setup.reducedMotion ?? false,
		placeOf: placesAbove,
	});
	await settle();
	await settle();
	if (setup.arrived ?? true) frames.run(PICTURE_MS.entry + 64);
	server.reply = { status: 200, body: { ...belowPicture(), ...setup.below } };
	return frames;
}

/** Follow the picked card's drill-down, through the inspector's way in. */
async function openBelow(): Promise<void> {
	await act(async () => {
		fireEvent.click(document.querySelector<HTMLElement>("[data-slot='semantic-drill-down-open']")!);
	});
	await settle();
}

/** Go back to the board above, through its place in the header. */
async function goBack(): Promise<void> {
	await act(async () => {
		fireEvent.click(
			document.querySelector<HTMLElement>("nav[aria-label='Where this board sits'] button")!,
		);
	});
	await settle();
}

/**
 * Which board the pane is showing.
 * @returns Its name.
 */
function board(): string | null {
	return (
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-board") ?? null
	);
}

/**
 * How many boards are inside a card on the surface: one while a flight has it there.
 * @returns The count.
 */
function insets(): number {
	return surface().querySelectorAll("[data-dive-inset]").length;
}

/** A rectangle on screen. */
interface Screen {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * A length as a style spells it.
 * @param value The style's value, such as "14.2px".
 * @returns The number.
 */
function px(value: string): number {
	return Number.parseFloat(value);
}

/**
 * Where the board inside its card is on screen, as the camera draws it now.
 * @returns The frame's rectangle.
 */
function insetOnScreen(): Screen {
	const frame = surface().querySelector<HTMLElement>("[data-dive-inset]")!;
	const camera = cameraNow();
	return {
		x: camera.x + px(frame.style.left) * camera.scale,
		y: camera.y + px(frame.style.top) * camera.scale,
		width: px(frame.style.width) * camera.scale,
		height: px(frame.style.height) * camera.scale,
	};
}

/**
 * Where a picture of this size is on screen, drawn at the camera's own place.
 * @param size How big the picture is.
 * @param size.width Across.
 * @param size.height Down.
 * @returns Its rectangle.
 */
function pictureOnScreen(size: { readonly width: number; readonly height: number }): Screen {
	const camera = cameraNow();
	return {
		x: camera.x,
		y: camera.y,
		width: size.width * camera.scale,
		height: size.height * camera.scale,
	};
}

/**
 * Expect two rectangles to be the same place.
 * @param actual Where it is.
 * @param expected Where it should be.
 */
function expectSamePlace(actual: Screen, expected: Screen): void {
	for (const key of ["x", "y", "width", "height"] as const) {
		expect(actual[key]).toBeCloseTo(expected[key], 3);
	}
}

/**
 * Run the stage's frames for as long as a flight lasts, and a little over.
 * @param frames The frames in hand.
 */
function flyOut(frames: FramesByHand): void {
	frames.run(EXPLORING_MS.dive + 64);
}

test("a card's board opens by flying into the card, and lands where the board stands", async () => {
	const frames = await aboveOnScreen();
	try {
		await openBelow();
		// The flight is in the air: the board is inside its card, the camera is on its way, and the board above is still the pane's.
		expect(board()).toBe("pipeline");
		expect(insets()).toBe(1);
		expect(surface().hasAttribute("data-camera-motion")).toBe(true);
		const before = cameraNow();
		frames.run(EXPLORING_MS.dive / 2);
		expect(cameraNow().scale).toBeGreaterThan(before.scale);
		expect(board()).toBe("pipeline");

		flyOut(frames);
		const lastFrame = insetOnScreen();
		await settle();

		// The board has taken over from the one inside the card, in the same place and with no entrance of its own.
		expect(board()).toBe("engine");
		expect(insets()).toBe(0);
		expect(surface().hasAttribute("data-picture-motion")).toBe(false);
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
		expectSamePlace(pictureOnScreen(BELOW), lastFrame);
		expect(cameraNow().scale).toBeCloseTo(
			Math.min((800 - 48) / BELOW.width, (600 - 48) / BELOW.height),
			6,
		);
	} finally {
		frames.restore();
	}
});

test("going back flies out of the card that opened the board, and lands on the whole board above", async () => {
	const frames = await aboveOnScreen();
	try {
		await openBelow();
		flyOut(frames);
		await settle();
		expect(board()).toBe("engine");
		const left = pictureOnScreen(BELOW);

		await goBack();
		// The board is seen where it was, now inside its card on the board above.
		expect(board()).toBe("engine");
		expect(insets()).toBe(1);
		expectSamePlace(insetOnScreen(), left);

		flyOut(frames);
		await settle();
		expect(board()).toBe("pipeline");
		expect(insets()).toBe(0);
		expect(surface().hasAttribute("data-picture-motion")).toBe(false);
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
	} finally {
		frames.restore();
	}
});

/**
 * Whether an element is drawn as seen from far: under the far class, its own or an ancestor's.
 * @param element The element.
 * @returns True when its cards draw their names.
 */
function drawnFar(element: Element): boolean {
	return element.closest(".is-far") !== null;
}

/** What the surface's far view was before one change of it. */
interface FarBefore {
	readonly far: boolean;
}

/** Which board the stage showed before one change of it. */
interface BoardBefore {
	readonly board: string | null;
}

/**
 * Whether a change is one of the far view.
 * @param seen The change.
 * @returns True when it is.
 */
function ofFar(seen: FarBefore | BoardBefore): seen is FarBefore {
	return "far" in seen;
}

/**
 * Whether a change is one of the board on screen.
 * @param seen The change.
 * @returns True when it is.
 */
function ofBoard(seen: FarBefore | BoardBefore): seen is BoardBefore {
	return "board" in seen;
}

/**
 * What one change put in place: what the next change of the same thing replaced, or what is there now.
 * @param seen Every change, in order, as what each replaced.
 * @param index The change.
 * @param stage The pane's stage.
 * @returns The far view and the board on screen just after it.
 */
function after(
	seen: readonly (FarBefore | BoardBefore)[],
	index: number,
	stage: Element,
): { readonly far: boolean; readonly shown: string | null } {
	const later = seen.slice(index + 1);
	return {
		far: later.find(ofFar)?.far ?? surface().classList.contains("is-far"),
		shown: later.find(ofBoard)?.board ?? stage.getAttribute("data-board"),
	};
}

/**
 * Watch every change of the far view on the pane's surface, with the board on
 * screen when it happened.
 * @returns Stop watching, and say what changed: "<board>: far" or "<board>: near", in order.
 */
function watchFarView(): () => string[] {
	const stage = document.querySelector("[data-slot='semantic-board-stage']")!;
	const seen: (FarBefore | BoardBefore)[] = [];
	/**
	 * Note what each change replaced.
	 * @param records The changes.
	 */
	const note = (records: MutationRecord[]): void => {
		for (const record of records) {
			if (record.attributeName === "data-board") {
				seen.push({ board: record.oldValue });
			} else if (record.target === surface()) {
				seen.push({ far: (record.oldValue ?? "").split(/\s+/).includes("is-far") });
			}
		}
	};
	const observer = new MutationObserver(note);
	observer.observe(stage, {
		subtree: true,
		attributes: true,
		attributeOldValue: true,
		attributeFilter: ["class", "data-board"],
	});
	return () => {
		note(observer.takeRecords());
		observer.disconnect();
		return seen.flatMap((change, index) => {
			if (!ofFar(change)) return [];
			const { far, shown } = after(seen, index, stage);
			return far === change.far ? [] : [`${shown ?? ""}: ${far ? "far" : "near"}`];
		});
	};
}

test("a flight between two boards seen from far swaps no card's words for its name, in the air or as the board takes over", async () => {
	const frames = await aboveOnScreen({ above: FAR, below: FAR });
	try {
		expect(surface().classList.contains("is-far")).toBe(true);
		const changes = watchFarView();
		await openBelow();
		for (let at = 0; at < EXPLORING_MS.dive + 64; at += 16) {
			frames.run(16);
			const inset = surface().querySelector("[data-dive-inset]");
			if (inset !== null) expect(drawnFar(inset)).toBe(true);
		}
		await settle();
		frames.run(EXPLORING_MS.cameraRest + 64);
		await settle();
		expect(board()).toBe("engine");
		expect(changes()).toEqual([]);
		expect(surface().classList.contains("is-far")).toBe(true);
	} finally {
		frames.restore();
	}
});

test("a board seen from far that opens from a board seen near swaps its cards once, after it has taken over from the flight", async () => {
	const frames = await aboveOnScreen({ below: FAR });
	try {
		expect(surface().classList.contains("is-far")).toBe(false);
		const changes = watchFarView();
		await openBelow();
		// In the air the board inside the card is drawn as the picture around it is, so the board that takes over looks the same.
		for (let at = 0; at < EXPLORING_MS.dive + 64; at += 16) {
			frames.run(16);
			const inset = surface().querySelector("[data-dive-inset]");
			if (inset !== null) expect(drawnFar(inset)).toBe(false);
		}
		await settle();
		frames.run(EXPLORING_MS.cameraRest + 64);
		await settle();
		expect(board()).toBe("engine");
		// Then the cards swap their words for their names once, with the picture's own fade.
		expect(changes()).toEqual(["engine: far"]);
	} finally {
		frames.restore();
	}
});

/** The inputs that end a flight at its end, by the event each one is. */
const INPUTS = [
	{ name: "a press", type: "pointerdown" },
	{ name: "a turn of the wheel", type: "wheel" },
	{ name: "a key", type: "keydown" },
] as const;

/**
 * Send one of the inputs at the stage, the way a reader's hand does.
 * @param type Which event.
 */
function sendInput(type: (typeof INPUTS)[number]["type"]): void {
	if (type === "pointerdown") {
		fireEvent.pointerDown(viewport(), { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
	} else if (type === "wheel") {
		fireEvent.wheel(viewport(), { deltaY: -120 });
	} else {
		fireEvent.keyDown(viewport(), { key: "ArrowRight" });
	}
}

for (const input of INPUTS) {
	test(`${input.name} during the flight lands it at once and does not reach the picture`, async () => {
		const frames = await aboveOnScreen();
		let reached = false;
		/** Note that the input got through. */
		const spy = (): void => {
			reached = true;
		};
		document.addEventListener(input.type, spy);
		try {
			await openBelow();
			expect(insets()).toBe(1);
			frames.run(EXPLORING_MS.dive / 4);
			act(() => {
				sendInput(input.type);
			});
			await settle();
			expect(board()).toBe("engine");
			expect(insets()).toBe(0);
			expect(reached).toBe(false);
		} finally {
			document.removeEventListener(input.type, spy);
			frames.restore();
		}
	});
}

test("a board opens by flying only when it can be seen in time", async () => {
	const frames = await aboveOnScreen();
	try {
		// The board below has no picture to hand yet: the pane gives the flight up after a moment and opens it the plain way.
		server.reply = "pending";
		await openBelow();
		expect(insets()).toBe(0);
		frames.run(EXPLORING_MS.divePrefetch + 32);
		await settle();
		expect(insets()).toBe(0);
		expect(board()).toBe("pipeline");
		expect(
			document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-state"),
		).toBe("loading");
	} finally {
		frames.restore();
	}
});

test("a board does not fly while a picture is still coming in", async () => {
	// When that picture lands it is written to the surface again, which would take the board inside the card away.
	const frames = await aboveOnScreen({ arrived: false });
	try {
		expect(surface().hasAttribute("data-picture-motion")).toBe(true);
		await openBelow();
		expect(insets()).toBe(0);
		expect(board()).toBe("engine");
	} finally {
		frames.restore();
	}
});

test("a reader who asked for no motion gets the board at once, and goes back at once", async () => {
	const frames = await aboveOnScreen({ reducedMotion: true });
	try {
		await openBelow();
		expect(insets()).toBe(0);
		expect(board()).toBe("engine");
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
		await goBack();
		expect(insets()).toBe(0);
		expect(board()).toBe("pipeline");
	} finally {
		frames.restore();
	}
});
