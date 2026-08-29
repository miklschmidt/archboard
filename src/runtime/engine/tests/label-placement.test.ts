import { expect, test } from "bun:test";
import { expandElements } from "../expand-elements.ts";
import {
	boundTextDrift,
	boundTextPlacement,
	labelAnchorOf,
	planLabelRepair,
	recentreBoundTexts,
	rescueDriftedBoundTexts,
} from "../labels.ts";
import type { LabelledElement } from "../labels.ts";
import type { PlacedLabelElement } from "./fixtures/label-cases.ts";
const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | undefined, message: string): T => {
	if (value === undefined) throw new Error(message);
	return value;
};
const settle = (elements: PlacedLabelElement[], ids?: readonly string[]): PlacedLabelElement[] => {
	const moves = new Map(recentreBoundTexts(elements, ids).map((move) => [move.id, move]));
	return elements.map((element) => {
		const move = moves.get(element.id);
		return move ? { ...element, x: move.x, y: move.y } : element;
	});
};
const sceneBox = (elements: readonly PlacedLabelElement[]) => ({
	minX: Math.min(...elements.map((element) => element.x)),
	minY: Math.min(...elements.map((element) => element.y)),
	maxX: Math.max(...elements.map((element) => element.x + element.width)),
	maxY: Math.max(...elements.map((element) => element.y + element.height)),
});

import {
	drawnLabels,
	ExpandedElementSchema,
	placedLabels,
	pollutedLabels,
} from "./fixtures/label-cases.ts";

test("places labels on containers and follows geometry changes", () => {
	const placed = placedLabels;

	{
		const values = placed();
		const shapeElement = required(values[0], "shape fixture missing");
		const arrow = required(values[2], "arrow fixture missing");
		assert(
			JSON.stringify(labelAnchorOf(shapeElement)) === JSON.stringify({ x: 100, y: 40 }),
			`a shape hangs its label from ${JSON.stringify(labelAnchorOf(shapeElement))}, not its centre`,
		);
		assert(
			JSON.stringify(labelAnchorOf(arrow)) === JSON.stringify({ x: 300, y: 40 }),
			`a two-point arrow hangs its label from ${JSON.stringify(labelAnchorOf(arrow))}, not its midpoint`,
		);

		const elbow = {
			id: "e",
			type: "arrow",
			x: 0,
			y: 0,
			points: [
				[0, 0],
				[100, 0],
				[100, 100],
			],
		} as const;
		assert(
			JSON.stringify(labelAnchorOf(elbow)) === JSON.stringify({ x: 100, y: 0 }),
			`an odd-length path anchors at ${JSON.stringify(labelAnchorOf(elbow))}, not its middle vertex`,
		);

		const stale = {
			id: "s",
			type: "arrow",
			x: 0,
			y: 0,
			width: 9999,
			height: 9999,
			points: [
				[0, 0],
				[200, 0],
			],
		} as const;
		assert(
			labelAnchorOf(stale)?.x === 100,
			"an arrow trusted its stale width instead of its points",
		);

		assert(
			labelAnchorOf({ id: "p", type: "arrow", x: 0, y: 0 }) === undefined,
			"a pathless arrow invented an anchor",
		);
		assert(
			labelAnchorOf({ id: "n", type: "rectangle" }) === undefined,
			"a shape with no coordinates invented an anchor",
		);
		assert(
			boundTextPlacement(required(placed()[0], "shape fixture missing"), {
				id: "t",
				type: "text",
			}) === undefined,
			"an unmeasured label was given a position",
		);
	}

	{
		const start = placed();
		assert(boundTextDrift(start).length === 0, "the fixture starts out drifted");

		const moved = start.map((el) => (el.id === "svc" ? { ...el, x: 0, y: 900 } : el));
		const strayed = boundTextDrift(moved);
		assert(
			strayed.length === 1 && strayed[0]?.textId === "svc-label",
			`moving a box did not strand its label (${strayed.length} drifted)`,
		);
		assert(
			(strayed[0]?.distance ?? 0) > 800,
			`the stranded label reads ${Math.round(strayed[0]?.distance ?? 0)}px from its box`,
		);
		const strandedBox = sceneBox(moved.filter((el) => el.id.startsWith("svc")));
		assert(
			strandedBox.maxY - strandedBox.minY > 900,
			`the model does not reproduce the phantom region (${Math.round(strandedBox.maxY - strandedBox.minY)}px tall)`,
		);
		const settledMove = settle(moved, ["svc"]);
		assert(
			boundTextDrift(settledMove).length === 0,
			"settling did not bring the moved label along",
		);
		assert(
			settledMove.find((el) => el.id === "svc-label")?.y === 927,
			"the moved label did not land on its box",
		);
		const closedBox = sceneBox(settledMove.filter((el) => el.id.startsWith("svc")));
		assert(
			closedBox.minY === 900 && closedBox.maxY === 980,
			"the phantom region survived settling",
		);

		const resized = start.map((el) => (el.id === "svc" ? { ...el, width: 600, height: 400 } : el));
		assert(
			recentreBoundTexts(resized, ["svc"]).length === 1,
			"resizing a box did not knock its label off centre",
		);
		const settledResize = settle(resized, ["svc"]);
		assert(
			boundTextDrift(settledResize).length === 0,
			"settling did not re-centre the resized box's label",
		);
		const centred = required(
			settledResize.find((el) => el.id === "svc-label"),
			"resized label missing",
		);
		assert(
			centred.x === 250 && centred.y === 187,
			`the resized box's label sits at ${centred.x},${centred.y}`,
		);

		const rerouted = start.map((el) =>
			el.id === "wire"
				? {
						...el,
						x: 200,
						y: 40,
						points: [
							[0, 0],
							[300, 400],
						] as [number, number][],
					}
				: el,
		);
		assert(
			recentreBoundTexts(rerouted, ["wire"]).length === 1,
			"re-routing an arrow did not leave its label behind",
		);
		const settledRoute = settle(rerouted, ["wire"]);
		assert(
			boundTextDrift(settledRoute).length === 0,
			"settling did not move the re-routed label to the new midpoint",
		);
		const onWire = required(
			settledRoute.find((el) => el.id === "wire-label"),
			"rerouted label missing",
		);
		assert(
			onWire.x === 325 && onWire.y === 227,
			`the re-routed label sits at ${onWire.x},${onWire.y}`,
		);

		assert(recentreBoundTexts(start).length === 0, "a settled board still had labels to move");
		assert(
			recentreBoundTexts(settledMove, ["wire"]).length === 0,
			"settling one container disturbed another",
		);
	}

	{
		const topAligned = placed().map((el) =>
			el.id === "svc-label" ? Object.assign({}, el, { y: 5 }) : el,
		);
		assert(boundTextDrift(topAligned).length === 0, "a top-aligned label was read as drift");

		const twinned = [
			...placed(),
			{
				id: "svc-copy",
				type: "text",
				containerId: "svc",
				x: -900,
				y: -900,
				width: 100,
				height: 26,
				text: "AuthService",
			} as const,
		];
		assert(
			boundTextDrift(twinned).some((entry) => entry.textId === "svc-copy"),
			"a stray duplicate label was not reported as drifted",
		);

		assert(
			boundTextDrift([
				{ id: "c", type: "rectangle" as const },
				{ id: "c-l", type: "text" as const, containerId: "c", text: "x" },
			]).length === 0,
			"a container with no coordinates was reported as drifted",
		);
	}

	{
		const start = placed();
		assert(
			rescueDriftedBoundTexts(start).length === 0,
			"a settled board was rearranged by the rescue",
		);

		const nudged = start.map((el) =>
			el.id === "wire-label" ? { ...el, x: el.x + 6, y: el.y - 4 } : el,
		);
		assert(
			rescueDriftedBoundTexts(nudged).length === 0,
			"the pane argued with Excalidraw over a few pixels, which is how the loop starts",
		);

		const lost = start.map((el) =>
			el.id === "wire-label" ? Object.assign({}, el, { x: 15, y: -82 }) : el,
		);
		const rescue = rescueDriftedBoundTexts(lost);
		assert(
			rescue.length === 1 && rescue[0]?.id === "wire-label",
			`the rescue moved ${rescue.length} label(s), expected the lost one`,
		);
		assert(
			Math.round(rescue[0]?.x ?? 0) === 275 && Math.round(rescue[0]?.y ?? 0) === 27,
			`the rescued arrow label was sent to ${Math.round(rescue[0]?.x ?? 0)},${Math.round(rescue[0]?.y ?? 0)}`,
		);
		const rescued = lost.map((el) =>
			el.id === "wire-label"
				? Object.assign({}, el, {
						x: required(rescue[0], "rescue missing").x,
						y: required(rescue[0], "rescue missing").y,
					})
				: el,
		);
		assert(
			boundTextDrift(rescued).length === 0,
			"the rescue did not put the label back on its arrow",
		);
		assert(rescueDriftedBoundTexts(rescued).length === 0, "the rescue is not a fixed point");
	}

	{
		const expanded = ExpandedElementSchema.array().parse(
			expandElements(drawnLabels(), { forStore: true }),
		);
		const boards: Record<string, LabelledElement[]> = {
			drawn: expanded,
			placed: placed(),
			"round-tripped": expanded,
		};

		const polluted = pollutedLabels();
		const plan = planLabelRepair(polluted);
		const doomed = new Set(plan.removeIds);
		boards.repaired = polluted.filter((element) => !doomed.has(element.id));

		for (const [name, elements] of Object.entries(boards)) {
			const drifted = boundTextDrift(elements);
			assert(
				drifted.length === 0,
				`${name}: ${drifted.length} bound text(s) further from their container than its size allows` +
					(drifted[0]
						? ` — ${JSON.stringify(drifted[0].text)} at ${Math.round(drifted[0].distance)}px`
						: ""),
			);
		}
	}
});
