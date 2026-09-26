// Every reading is finished twice, once routed with reserved labels' full
// clearance. The cleared drawing is kept where it gives a crowded label its
// clearance, or where it is tidier. Kept wherever it merely cost nothing, it
// moved lines round boards it cured nothing in (Codex workhorse). A cleared
// drawing may place the board anew, but not on a page grown by more than the
// labels it clears are worth.
// What this catches: the cleared drawing chosen where it cures nothing and
// is no tidier, on a page grown past what it cures, and a fault in the
// ordinary drawing hidden behind it.

import { expect, test } from "bun:test";
import { clearerDrawing, type ArchitectureDrawing } from "@/runtime/semantic-renderer/layout";
import { at, sketch } from "@/runtime/semantic-renderer/tests/sketched-drawings";

const cards = {
	top: { x: 0, y: 0, width: 100, height: 50 },
	bottom: { x: 0, y: 300, width: 100, height: 50 },
	right: { x: 300, y: 0, width: 100, height: 50 },
	low: { x: 300, y: 300, width: 100, height: 50 },
};

/**
 * A drawing of a labelled line and a line that passes its label a way off.
 * @param beside Where the passing line runs down beside the label, whose right edge is at 140.
 * @param page The page's size.
 * @returns The drawing.
 */
function passing(
	beside: number,
	page = { width: 1000, height: 1000 },
): Promise<ArchitectureDrawing> {
	return Promise.resolve(
		sketch(
			cards,
			[
				{
					id: "labelled",
					from: "top",
					to: "bottom",
					points: at([50, 50], [50, 300]),
					label: { x: 60, y: 150, width: 80, height: 20 },
				},
				{
					id: "passing",
					from: "right",
					to: "low",
					points: at([350, 50], [350, 120], [beside, 120], [beside, 250], [350, 250], [350, 300]),
				},
			],
			page,
		),
	);
}

test("the cleared drawing is kept where it gives a crowded label its clearance", async () => {
	const cleared = passing(160);
	expect(await clearerDrawing(passing(148), cleared)).toBe(await cleared);
});

test("a cleared drawing that clears no label is kept only where it is tidier", async () => {
	const [shorter, longer] = [passing(180), passing(170)];
	expect(await clearerDrawing(shorter, longer)).toBe(await shorter);
	expect(await clearerDrawing(longer, shorter)).toBe(await shorter);
});

test("the cleared drawing is not kept on a page larger than the labels it clears are worth", async () => {
	const ordinary = passing(148);
	expect(await clearerDrawing(ordinary, passing(160, { width: 1100, height: 1000 }))).toBe(
		await ordinary,
	);
});

test("a cleared drawing the router refuses leaves the ordinary one, and a fault is thrown", async () => {
	const ordinary = passing(148);
	const refused = Promise.reject(new Error("NativeRouteUnavailable: no route clear of obstacles"));
	expect(await clearerDrawing(ordinary, refused)).toBe(await ordinary);
	const fault = new Error("a fault in the ordinary drawing");
	await expect(clearerDrawing(Promise.reject(fault), passing(160))).rejects.toBe(fault);
});
