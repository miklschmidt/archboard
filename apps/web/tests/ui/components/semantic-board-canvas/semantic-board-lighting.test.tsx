// What the picture lights when a part is poked: the part, what it is wired to,
// and the parts at the other ends, with the rest receding. Nothing here writes:
// the light is attention, like the camera and the selection.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { litBy } from "#ui/rules/semantic-board-canvas/board/connections.ts";
import { takeFrames } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	settle,
	surface,
	viewport,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import {
	WIRING,
	lighting,
	lit,
	pick,
	pointAt,
	served,
} from "#tests/ui/support/semantic-board-canvas/wiring-fixture.tsx";

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

/**
 * The id a `url(#id)` refers to.
 * @param value A style or an attribute.
 * @returns The id, or undefined when it refers to none.
 */
function referredTo(value: string | null | undefined): string | undefined {
	return /url\(["']?#([^"')]+)["']?\)/.exec(value ?? "")?.[1];
}

/**
 * What a route's line group is masked with right now: the mask it is pointed at
 * by style, or the picture's own.
 * @param id The relationship.
 * @returns The mask's id, as the group refers to it.
 */
function maskOf(id: string): string | null {
	const group = surface().querySelector(`g[data-semantic-id='${id}']`);
	return (
		referredTo(group?.getAttribute("style")) ?? referredTo(group?.getAttribute("mask")) ?? null
	);
}

/**
 * What a mask cuts away, by the cap of each stroke.
 * @param id The mask's id.
 * @returns The caps, in order.
 */
function cutsOf(id: string | null): (string | null)[] {
	const mask = surface().querySelector(`mask[id='${id}']`);
	return [...(mask?.querySelectorAll("path") ?? [])].map((path) =>
		path.getAttribute("stroke-linecap"),
	);
}

test("a lit relationship that shares a lane keeps its own ink along it, and a gap under a crossing line", async () => {
	// The picture draws the stretch of the queue's relationship to the worker with another route's line.
	await served({ trunks: ["e3", "e1"] });
	expect(cutsOf(maskOf("e3"))).toEqual(["butt", "round"]);
	await pick("q");
	expect(lit()).toContain("e3");
	// The cut for the shared lane is lifted, so the line is lit from end to end; the gap for a crossing stays.
	expect(cutsOf(maskOf("e3"))).toEqual(["round"]);
	// A relationship the poke does not light is drawn as the picture draws it.
	expect(cutsOf(maskOf("e1"))).toEqual(["butt", "round"]);
	await act(async () => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await settle();
	expect(cutsOf(maskOf("e3"))).toEqual(["butt", "round"]);
});

test("a relationship that is picked out is drawn as the picture draws it", async () => {
	await served({ trunks: ["e3"] });
	await pick("e3");
	expect(lit()).toContain("e3");
	// The picture shows the picked relationship in full by its own rule, which a mask of the viewer's would override.
	expect(
		surface().querySelector("g[data-semantic-id='e3']")?.getAttribute("style") ?? "",
	).not.toContain("mask");
});
