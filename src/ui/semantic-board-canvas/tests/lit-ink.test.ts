// A lit relationship, lit along the whole of its route.
//
// What these catch: a lit line that goes pale along a lane another line draws,
// a gap under a crossing that is closed in lighting the line, a selected line
// whose own rule is overridden, and a mask copied again at every light.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { lightInk } from "@/ui/semantic-board-canvas/lighting";

beforeAll(() => {
	GlobalRegistrator.register();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * The mask a route that shares a lane has: its box, the stretch another route
 * draws (butt ends) and the gap under a crossing line (round ends).
 * @param id The mask's id.
 * @param cuts The caps of the cutouts, in order.
 * @returns The markup.
 */
function maskOf(id: string, cuts: readonly string[]): string {
	const pieces = cuts.map(
		(cap) => `<path d="M0 0 L4 4" stroke="black" stroke-width="9" stroke-linecap="${cap}"></path>`,
	);
	return `<mask id="${id}"><rect width="40" height="40" fill="white"></rect>${pieces.join("")}</mask>`;
}

/**
 * A picture with some masks and some relationships' lines.
 * @param masks The masks, by id and the caps of their cutouts.
 * @param lines The lines: id, the mask each refers to, and its marks.
 * @returns The picture's root.
 */
function pictureOf(
	masks: Readonly<Record<string, readonly string[]>>,
	lines: readonly (readonly [string, string, string])[],
): Element {
	const holder = document.createElement("div");
	const defs = Object.entries(masks).map(([id, cuts]) => maskOf(id, cuts));
	const groups = lines.map(
		([id, mask, marks]) =>
			`<g data-semantic-kind="edge" data-semantic-id="${id}" mask="url(#${mask})" class="${marks}"></g>`,
	);
	holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs.join("")}</defs>${groups.join("")}</svg>`;
	return holder.querySelector("svg")!;
}

/**
 * The mask a line's group is pointed at by style, if it is.
 * @param root The picture's root.
 * @param id The relationship.
 * @returns The mask's id.
 */
function litMaskOf(root: Element, id: string): string | null {
	const style = root.querySelector(`g[data-semantic-id='${id}']`)?.getAttribute("style") ?? "";
	return /url\(["']?#([^"')]+)["']?\)/.exec(style)?.[1] ?? null;
}

/**
 * The caps of the cutouts of a mask in the picture.
 * @param root The picture's root.
 * @param id The mask.
 * @returns The caps, in order.
 */
function capsOf(root: Element, id: string | null): (string | null)[] {
	const paths = root.querySelector(`mask[id='${id}']`)?.querySelectorAll("path") ?? [];
	return [...paths].map((path) => path.getAttribute("stroke-linecap"));
}

describe("a lit relationship on a shared lane", () => {
	test("is pointed at its mask without the cutout for the lane, and keeps the gap under a crossing", () => {
		const root = pictureOf({ a: ["butt", "round"] }, [["e1", "a", "is-lit"]]);
		lightInk(root);
		const lit = litMaskOf(root, "e1");
		expect(lit).toBe("a-lit");
		expect(capsOf(root, lit)).toEqual(["round"]);
		// The picture's own mask is as the renderer wrote it.
		expect(capsOf(root, "a")).toEqual(["butt", "round"]);
	});

	test("shares one copy of the mask with every lit line that has it, however often it is lit", () => {
		const root = pictureOf({ a: ["butt"] }, [
			["e1", "a", "is-lit"],
			["e2", "a", "is-lit"],
		]);
		lightInk(root);
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBe("a-lit");
		expect(litMaskOf(root, "e2")).toBe("a-lit");
		expect(root.querySelectorAll("mask[id='a-lit']")).toHaveLength(1);
	});

	test("is drawn as the picture draws it again once it is no longer lit", () => {
		const root = pictureOf({ a: ["butt", "round"] }, [["e1", "a", "is-lit"]]);
		lightInk(root);
		root.querySelector("g")!.classList.remove("is-lit");
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBeNull();
	});
});

describe("a relationship that needs nothing lifted", () => {
	test("is left as the picture draws it when it is not lit", () => {
		const root = pictureOf({ a: ["butt", "round"] }, [["e1", "a", ""]]);
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBeNull();
	});

	test("is left alone when its mask asks nothing of a trunk", () => {
		const root = pictureOf({ a: ["round"] }, [["e1", "a", "is-lit"]]);
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBeNull();
		expect(root.querySelectorAll("mask")).toHaveLength(1);
	});

	test("is left to the picture's own rule when it is the one picked out", () => {
		const root = pictureOf({ a: ["butt", "round"] }, [["e1", "a", "is-lit is-selected"]]);
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBeNull();
	});

	test("is left alone when its mask is not in the picture", () => {
		const root = pictureOf({}, [["e1", "gone", "is-lit"]]);
		lightInk(root);
		expect(litMaskOf(root, "e1")).toBeNull();
	});
});
