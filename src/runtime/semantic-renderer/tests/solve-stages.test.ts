// A reading is placed once per set of label reservations and that placement is
// routed by every attempt that shares it (TASK-342). The split is only a saving
// when it draws what one whole solve draws, so the stages are held to it here.

import { expect, test } from "bun:test";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";
import { SOLVE_STAGE } from "@/transformers/semantic-renderer/host";
import input from "@/runtime/semantic-renderer/tests/sibling-order-graph.json";

test("placing and then routing a graph draws what solving it whole draws", async () => {
	await AvoidLib.load();
	const solve = createLayoutEngine(await instance(), AvoidLib.getInstance());
	const whole = solve(structuredClone(input.graph), input.options);
	const placed = solve(structuredClone(input.graph), {
		...input.options,
		[SOLVE_STAGE]: "place",
	});
	expect(placed.edges?.some((edge) => edge.sections !== undefined)).toBe(false);
	const routed = solve(structuredClone(placed), { ...input.options, [SOLVE_STAGE]: "route" });
	expect(routed).toEqual(whole);
});
