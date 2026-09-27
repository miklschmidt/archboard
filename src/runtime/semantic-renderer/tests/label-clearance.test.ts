// Every reading is finished twice, once routed with reserved labels' full
// clearance. The cleared drawing is kept where it gives a crowded label its
// clearance, or where it is tidier. Kept wherever it merely cost nothing, it
// moved lines round boards it cured nothing in (Codex workhorse). A cleared
// drawing may place the board anew, but not on a page grown by more than the
// labels it clears are worth.
// Each label the cleared drawing crowds counts against it as a defect
// brought, so it is not kept for a shorter line bought by crowding a label.
// What this catches: the cleared drawing chosen where it cures nothing and
// is no tidier, on a page grown past what it cures, where it crowds a label
// for a tidier rank, a fault in the ordinary drawing hidden behind it, and
// both routings refused answered with nothing rather than the refusal.

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

test("a cleared drawing that crowds a label is not kept for a shorter line", async () => {
	const labelled = {
		id: "labelled",
		from: "top",
		to: "bottom",
		points: at([50, 50], [50, 300]),
		label: { x: 60, y: 150, width: 80, height: 20 },
	};
	const ends = {
		...cards,
		from: { x: 120, y: 0, width: 100, height: 50 },
		to: { x: 120, y: 400, width: 100, height: 50 },
	};
	const ordinary = sketch(ends, [
		labelled,
		{
			id: "round",
			from: "from",
			to: "to",
			points: at([200, 50], [200, 100], [300, 100], [300, 350], [200, 350], [200, 400]),
		},
	]);
	const crowding = sketch(ends, [
		labelled,
		{ id: "round", from: "from", to: "to", points: at([148, 50], [148, 400]) },
	]);
	expect(await clearerDrawing(Promise.resolve(ordinary), Promise.resolve(crowding))).toBe(ordinary);
});

test("a cleared drawing the router refuses leaves the ordinary one, both refused throw the refusal, and a fault is thrown", async () => {
	const ordinary = passing(148);
	const refused = new Error("NativeRouteUnavailable: no route clear of obstacles");
	expect(await clearerDrawing(ordinary, Promise.reject(refused))).toBe(await ordinary);
	const fault = new Error("a fault in the ordinary drawing");
	await expect(clearerDrawing(Promise.reject(fault), passing(160))).rejects.toBe(fault);
	const first = new Error("NativeRouteUnavailable: the ordinary routing has no route");
	const both = clearerDrawing(Promise.reject(first), Promise.reject(refused));
	await expect(both).rejects.toBe(first);
});
