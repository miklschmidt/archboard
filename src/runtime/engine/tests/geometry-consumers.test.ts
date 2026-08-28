import { expect, test } from "bun:test";
import { compareBoards, type CompareSideInput } from "../compare.ts";
import { buildSelectionReport, describeScene } from "../describe.ts";
import { boxOf, boundingBoxOf, clusterBoxes, regionName } from "../layout.ts";
import { labelAnchorOf } from "../labels.ts";
import { planPromotion } from "../promote.ts";
import type { ServerElement } from "../types.ts";
import { geometryConsumerScene } from "./fixtures/geometry-cases.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | null | undefined, message: string): T => {
	if (value === null || value === undefined) throw new Error(message);
	return value;
};
const near = (a: number, b: number, slack = 0.5): boolean => Math.abs(a - b) <= slack;
const centreOf = (box: { x: number; y: number; w: number; h: number }) => ({
	cx: box.x + box.w / 2,
	cy: box.y + box.h / 2,
});
const staleBox = (element: ServerElement) => ({
	x: element.x,
	y: element.y,
	w: element.width || 0,
	h: element.height || 0,
});
const elementById = (elements: readonly ServerElement[], id: string): ServerElement =>
	required(
		elements.find((element) => element.id === id),
		`Missing fixture element ${id}.`,
	);
const trueEdges = (element: ServerElement) => {
	if (!Array.isArray(element.points) || element.points.length === 0)
		return {
			x0: element.x,
			y0: element.y,
			x1: element.x + (element.width || 0),
			y1: element.y + (element.height || 0),
		};
	const xs = element.points.map(([x]) => element.x + (x ?? 0));
	const ys = element.points.map(([, y]) => element.y + (y ?? 0));
	return {
		x0: Math.min(...xs),
		y0: Math.min(...ys),
		x1: Math.max(...xs),
		y1: Math.max(...ys),
	};
};

const node = (
	id: string,
	name: string,
): { archboard: { node: string; kind: string; name: string } } => ({
	archboard: { node: id, kind: "service", name },
});

test("feeds measured geometry to compare, promotion, describe, layout, and selection", () => {
	{
		const scene = geometryConsumerScene;
		const reported = /Bounding box: \((-?\d+), (-?\d+)\) to \((-?\d+), (-?\d+)\)/.exec(
			describeScene(scene),
		);
		assert(reported !== null, "describe did not report a bounding box");
		const captures = required(reported, "describe did not report a bounding box");
		const minX = Number(required(captures[1], "missing minimum x"));
		const minY = Number(required(captures[2], "missing minimum y"));
		const maxX = Number(required(captures[3], "missing maximum x"));
		const maxY = Number(required(captures[4], "missing maximum y"));
		const outside = [];
		for (const element of scene) {
			if (!Array.isArray(element.points)) continue;
			for (const [pointX, pointY] of element.points) {
				const x = element.x + pointX;
				const y = element.y + pointY;
				if (x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1)
					outside.push(`${element.id} (${Math.round(x)},${Math.round(y)})`);
			}
		}
		assert(
			outside.length === 0,
			`the scene box (${minX},${minY})-(${maxX},${maxY}) crops ${outside.length} arrow point(s): ${outside.join(", ")}`,
		);
		const edges = scene.map(trueEdges);
		assert(
			near(minX, Math.min(...edges.map((edge) => edge.x0)), 1) &&
				near(minY, Math.min(...edges.map((edge) => edge.y0)), 1) &&
				near(maxX, Math.max(...edges.map((edge) => edge.x1)), 1) &&
				near(maxY, Math.max(...edges.map((edge) => edge.y1)), 1),
			`the box is (${minX},${minY})-(${maxX},${maxY}) but the board runs ` +
				`(${Math.round(Math.min(...edges.map((edge) => edge.x0)))},${Math.round(Math.min(...edges.map((edge) => edge.y0)))})-` +
				`(${Math.round(Math.max(...edges.map((edge) => edge.x1)))},${Math.round(Math.max(...edges.map((edge) => edge.y1)))})`,
		);
		const frame = required(boundingBoxOf(scene.map(boxOf)), "the scene has no frame");
		const misnamed = [];
		for (const element of scene.filter((candidate) => candidate.type === "arrow")) {
			const drawnMid = required(labelAnchorOf(element), `${element.id} has no label anchor`);
			const measured = centreOf(boxOf(element));
			const assumed = centreOf(staleBox(element));
			assert(
				near(measured.cx, drawnMid.x, 1) && near(measured.cy, drawnMid.y, 1),
				`${element.id}: measured centre (${Math.round(measured.cx)},${Math.round(measured.cy)}) is not where the arrow is drawn (${Math.round(drawnMid.x)},${Math.round(drawnMid.y)})`,
			);
			assert(
				Math.hypot(assumed.cx - drawnMid.x, assumed.cy - drawnMid.y) > 100,
				`${element.id}: top-left-plus-size happens to be right here, so this board is not exercising the bug`,
			);
			const named = regionName(measured.cx, measured.cy, frame);
			if (named !== regionName(assumed.cx, assumed.cy, frame))
				misnamed.push(`${element.id} is ${named}`);
		}
		assert(
			misnamed.length > 0,
			"no arrow here changes region between the two ways of measuring, so this board proves nothing about region",
		);
		const northArrow = elementById(scene, "to-north");
		const withNorth = clusterBoxes([
			{ id: "north", ...boxOf(elementById(scene, "north")) },
			{ id: "to-north", ...boxOf(northArrow) },
		]);
		assert(
			withNorth.length === 1 && withNorth.at(0)?.length === 2,
			"the arrow into North clusters with North, because it reaches it",
		);
		const stale = clusterBoxes([
			{ id: "north", ...boxOf(elementById(scene, "north")) },
			{ id: "to-north", ...staleBox(northArrow) },
		]);
		assert(
			stale.length === 2,
			"the check is not exercising the bug: measured the old way the arrow should miss North entirely",
		);
		const report = buildSelectionReport(
			{
				elementIds: ["to-northwest"],
				clientId: "pane",
				at: new Date().toISOString(),
			},
			scene,
			0,
		);
		const selected = required(report.elements[0], "selection omitted to-northwest");
		const arrowBox = boxOf(elementById(scene, "to-northwest"));
		assert(
			near(selected.x, arrowBox.x, 1) &&
				near(selected.y, arrowBox.y, 1) &&
				near(selected.width, arrowBox.w, 1),
			`selecting a leftward arrow reported ${JSON.stringify(selected)} rather than the board it covers`,
		);
	}

	{
		const elements: ServerElement[] = [
			{
				id: "hub-box",
				type: "rectangle",
				x: 300,
				y: 250,
				width: 200,
				height: 100,
				label: { text: "Hub" },
				customData: node("hub", "Hub"),
			},
			{
				id: "hub-stroke",
				type: "freedraw",
				x: 1600,
				y: 1200,
				width: 1300,
				height: 950,
				points: [
					[0, 0],
					[-1300, -950],
				],
				customData: node("hub", "Hub"),
			},
			{
				id: "stale-box",
				type: "rectangle",
				x: 3000,
				y: 3000,
				width: 300,
				height: 120,
				label: { text: "Payments" },
				customData: node("stale", "Payments"),
			},
			{
				id: "stale-stroke",
				type: "freedraw",
				x: 3400,
				y: 3300,
				width: 5000,
				height: 5000,
				points: [
					[0, 0],
					[-40, -30],
				],
				customData: node("stale", "Payments"),
			},
			{
				id: "far-box",
				type: "rectangle",
				x: 5000,
				y: 5000,
				width: 200,
				height: 100,
				label: { text: "Far" },
				customData: node("far", "Far"),
			},
			{
				id: "scribble",
				type: "freedraw",
				x: 5000,
				y: 5000,
				width: 4500,
				height: 4400,
				points: [
					[0, 0],
					[-4500, -4400],
				],
				label: { text: "note" },
			},
		];
		const identity = { board: "geometry", variant: "current" };
		const side: CompareSideInput = {
			key: "geometry",
			identity,
			elements,
			source: "memory",
		};
		const result = compareBoards(side, { ...side, key: "geometry@copy" });
		const factsFor = (id: string) => result.nodes.unchanged.find((n) => n.node === id)?.facts;

		const hub = required(factsFor("hub"), "compare omitted hub");
		assert(hub !== undefined, "compare should have found the hub node");
		assert(
			hub.cosmetic.width === 1300 && hub.cosmetic.height === 950,
			`a node holding a leftward stroke is 1300x950, not ${hub.cosmetic.width}x${hub.cosmetic.height}`,
		);
		const scattered = result.warnings.filter((w) => w.includes("separate places"));
		assert(
			scattered.length === 0,
			`nothing here is scattered, but compare said so: ${scattered.join(" / ")}`,
		);

		const stale = factsFor("stale");
		assert(
			stale?.cosmetic.type === "rectangle",
			`the node should be reported as the box it is, not as a ${stale?.cosmetic.type}`,
		);

		const scribble = required(
			result.plain.to.labelled.find((p) => p.id === "scribble"),
			"compare omitted scribble",
		);
		assert(scribble !== undefined, "compare should have reported the labelled freedraw");
		assert(
			scribble.region === "centre",
			`a stroke drawn back across the board is in the centre, not the ${scribble.region} where its origin is`,
		);
	}

	{
		const box: ServerElement = {
			id: "box",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 300,
			height: 120,
			label: { text: "Payments" },
		};
		const arrow: ServerElement = {
			id: "arrow",
			type: "arrow",
			x: 400,
			y: 300,
			width: 5000,
			height: 5000,
			points: [
				[0, 0],
				[-40, -30],
			],
			label: { text: "calls" },
		};
		const board = [box, arrow];
		const plan = planPromotion({
			targets: board,
			board,
			kind: "service",
			boardVariant: "current",
		});
		assert(
			plan.nodes.length === 1 && plan.nodes[0]?.name === "Payments",
			`promoting a box and an arrow names the node after the box, not "${plan.nodes[0]?.name}"`,
		);
	}
});
