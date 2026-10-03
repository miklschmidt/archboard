// What the picture lights when a part is poked: the part, what it is wired to,
// and the parts at the other ends, with the rest receding. Nothing here writes:
// the light is attention, like the camera and the selection.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { litBy } from "@/ui/semantic-board-canvas/lighting";
import { takeFrames } from "@/ui/semantic-board-canvas/tests/camera-probes";
import { settle, surface, viewport } from "@/ui/semantic-board-canvas/tests/stage-harness";
import {
	WIRING,
	lighting,
	lit,
	pick,
	pointAt,
	served,
} from "@/ui/semantic-board-canvas/tests/wiring-fixture";

/**
 * Which ids a poke lights, in a stable order.
 * @param id The part or relationship poked.
 * @returns The ids, sorted, or null.
 */
function litFor(id: string): string[] | null {
	const standing = litBy(WIRING, id);
	return standing === null ? null : [...standing].toSorted();
}

test("a part lights itself, its relationships and the parts at their other ends", () => {
	// The queue is wired to the handler before it and the worker after it, and
	// the containers that hold those are lit with them, so none is seen in a
	// frame that has receded.
	expect(litFor("q")).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"]);
	expect(litFor("l")).toEqual(["e4", "l", "shipping", "w"]);
});

test("a container lights what it holds and the relationships that cross its edge", () => {
	// The relationship between its own two parts is its content, and is lit with it.
	expect(litFor("orders")).toEqual(["e1", "e2", "e3", "g", "h", "orders", "q", "shipping", "w"]);
});

test("a relationship lights itself and its two ends", () => {
	expect(litFor("e3")).toEqual(["e3", "orders", "q", "shipping", "w"]);
});

test("something that is no part and no relationship lights nothing", () => {
	expect(litFor("nobody")).toBeNull();
});

test("picking a part lights what it is wired to, and letting go puts the picture back", async () => {
	await served();
	expect(lighting()).toBeNull();
	await pick("q");
	expect(lighting()).toBe("pick");
	expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "w", "shipping"].toSorted());
	await act(async () => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await settle();
	expect(lighting()).toBeNull();
	expect(lit()).toEqual([]);
});

test("a part wired to nothing the picture draws lights nothing", async () => {
	// A view that hides the ledger's one relationship leaves it nothing to light.
	await served({ hidden: ["e4"] });
	await pick("l");
	expect(lighting()).toBeNull();
	expect(lit()).toEqual([]);
});

test("resting the pointer on a part lights it lightly, after a moment, and leaving takes the light after a grace", async () => {
	await served();
	const frames = takeFrames();
	try {
		pointAt("q");
		frames.run(60);
		expect(lighting()).toBeNull();
		frames.run(80);
		expect(lighting()).toBe("hover");
		expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"].toSorted());

		// Crossing to another part while something is lit lights that at once.
		pointAt("l");
		expect(lit()).toEqual(["e4", "l", "shipping", "w"]);

		// Crossing the gap between two parts keeps the light, and leaving for good takes it.
		pointAt(null);
		frames.run(80);
		expect(lighting()).toBe("hover");
		frames.run(120);
		expect(lighting()).toBeNull();
	} finally {
		frames.restore();
	}
});

test("a part picked out keeps its light while the pointer visits another, and has it back after", async () => {
	await served();
	await pick("q");
	const frames = takeFrames();
	try {
		pointAt("l");
		frames.run(140);
		expect(lighting()).toBe("hover");
		expect(lit()).toEqual(["e4", "l", "shipping", "w"]);
		pointAt(null);
		frames.run(240);
		expect(lighting()).toBe("pick");
		expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"].toSorted());
	} finally {
		frames.restore();
	}
});

/**
 * The routes that are being drawn on over the picture.
 * @returns How many there are.
 */
function sweeping(): number {
	return surface().querySelectorAll(".ab-sweep path").length;
}

test("the relationships that light are drawn on once, and not for a reader who asked for no motion", async () => {
	await served();
	await pick("q");
	// The queue is wired to two relationships, and each is drawn on over the picture.
	expect(sweeping()).toBe(2);
	cleanup();

	await served({ reducedMotion: true });
	await pick("q");
	expect(lighting()).toBe("pick");
	expect(sweeping()).toBe(0);
});
