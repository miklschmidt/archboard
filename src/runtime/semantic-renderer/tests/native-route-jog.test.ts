// The router can leave a jog of a hundredth between two lanes. Simplifying
// treats that as no step at all, so the published route must stay square
// instead of joining the jog's ends with a slanted run, which refused the
// whole drawing (TASK-336, Voice coordinator's "Workhorse news" view).

import { expect, test } from "bun:test";
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import { publishRoutes } from "@/transformers/semantic-renderer/layout";

type Connection =
	Parameters<typeof publishRoutes>[1] extends ReadonlyMap<string, readonly (infer C)[]> ? C : never;

test("a sub-tolerance jog in a native route publishes as one square run", () => {
	const native = [
		{ x: 1140.51, y: 698.75 },
		{ x: 1160.51, y: 698.75 },
		{ x: 1160.51, y: 750.25 },
		{ x: 1160.5, y: 750.25 },
		{ x: 1160.5, y: 797.5 },
		{ x: 1180.5, y: 797.5 },
	];
	const connection = {
		hasValidRoute: () => true,
		hasCrossingObstacles: () => false,
		displayRoute: () => ({ size: () => native.length, at: (index: number) => native[index]! }),
	} as unknown as Connection;
	const edge: ElkExtendedEdge = { id: "start", sources: ["voice"], targets: ["session"] };
	expect(publishRoutes([edge], new Map([["start", [connection]]]), false)).toBe(true);
	const section = edge.sections![0]!;
	const points = [section.startPoint, ...section.bendPoints!, section.endPoint];
	for (const [index, point] of points.slice(1).entries()) {
		const previous = points[index]!;
		expect(point.x === previous.x || point.y === previous.y).toBe(true);
	}
	expect(section.startPoint).toEqual(native[0]!);
	expect(section.endPoint).toEqual(native.at(-1)!);
});
