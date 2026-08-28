import { expect, test } from "bun:test";
import { extentOf, isPathElement, measureLinear, remeasureLinear } from "../geometry.ts";
import { boxOf, boundingBoxOf } from "../layout.ts";
import { directionalArrows } from "./fixtures/geometry-cases.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const near = (a: number, b: number, slack = 0.5): boolean => Math.abs(a - b) <= slack;

test("measures all path directions, bends, freedraw, and fallback extents", () => {
	const arrows = directionalArrows;

	for (const [name, arrow] of Object.entries(arrows)) {
		const extent = extentOf(arrow);
		assert(
			near(extent.x, 200) &&
				near(extent.y, 300) &&
				near(extent.width, 300) &&
				near(extent.height, 200),
			`an arrow running ${name} covers (200,300) 300x200, not ${JSON.stringify(extent)}`,
		);
	}

	{
		const arrow = arrows["left and up"];
		const extent = extentOf(arrow);
		assert(
			arrow.x >= extent.x + extent.width && arrow.y >= extent.y + extent.height,
			"the check is not exercising the bug: this arrow should start at the far corner of the box it covers",
		);
		const frame = boundingBoxOf([boxOf(arrow)]);
		assert(
			frame?.maxX === 500 && frame.minX === 200,
			`a frame drawn round one leftward arrow is the arrow: ${JSON.stringify(boundingBoxOf([boxOf(arrow)]))}`,
		);
	}

	{
		const bent = {
			type: "arrow",
			x: 0,
			y: 0,
			points: [
				[0, 0],
				[-40, -90],
				[60, 10],
				[10, 40],
			],
		};
		const extent = extentOf(bent);
		assert(
			extent.x === -40 && extent.y === -90 && extent.width === 100 && extent.height === 130,
			`a bent path is measured over all of it, not ${JSON.stringify(extent)}`,
		);
	}

	{
		const stroke = {
			type: "freedraw",
			x: 900,
			y: 900,
			points: [
				[0, 0],
				[-50, -60],
				[-10, -20],
			],
		};
		assert(isPathElement(stroke), "a freedraw stroke carries a path");
		const extent = extentOf(stroke);
		assert(
			extent.x === 850 && extent.y === 840 && extent.width === 50 && extent.height === 60,
			`a freedraw stroke is measured from its stroke, not ${JSON.stringify(extent)}`,
		);
	}

	{
		const box = { type: "rectangle", x: 10, y: 20, width: 200, height: 100 };
		const extent = extentOf(box);
		assert(
			extent.x === 10 && extent.y === 20 && extent.width === 200 && extent.height === 100,
			"a box is its own extent",
		);
		assert(!isPathElement(box), "a rectangle carries no path");
		assert(
			extentOf({ x: 5, y: 6, points: [] }).width === 0,
			"an arrow with no path falls back to its stored size",
		);
		assert(remeasureLinear(box) === undefined, "there is nothing to re-measure about a rectangle");
	}

	{
		assert(
			measureLinear([
				[0, 0],
				[-300, -200],
			])?.width === 300,
			"a leftward path is 300 wide, not -300",
		);
		assert(measureLinear(undefined) === undefined, "no path, no measurement");
		const stale = {
			type: "arrow",
			x: 500,
			y: 500,
			width: 10,
			height: 10,
			points: [
				[0, 0],
				[-300, -200],
			],
		};
		const fixed = remeasureLinear(stale);
		assert(
			fixed?.width === 300 && fixed?.height === 200,
			`a stale arrow re-measures to 300x200, not ${JSON.stringify(fixed)}`,
		);
		const settled = { ...stale, width: 300.2, height: 199.9 };
		assert(
			remeasureLinear(settled) === undefined,
			"a fifth of a pixel is not a resize, and saying it is wakes the change feed for nothing",
		);
	}
});
