// Shared-destination routes coordinate their lane and arrival-port order.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { across, along, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import {
	corridorPoints,
	routePoints,
	routeCrosses,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import {
	detached,
	covering,
	overlaps,
	masking,
} from "@/runtime/semantic-renderer/tests/drawn-labels";

describe("same-destination routes", () => {
	for (const shape of ["forward", "blocked left", "return", "with unrelated"] as const) {
		test(`same-destination ${shape} routes nest their lanes and arrival ports`, async () => {
			const returning = shape === "return";
			const paired = shape === "blocked left";
			const unrelated = shape === "with unrelated";
			const base = VariantContentSchema.parse({
				nodes: [
					{ id: "first", name: "Theme", kind: "module" },
					{ id: "second", name: "Layout", kind: "module" },
					{ id: "middle", name: "Intermediate stage", kind: "module" },
					...(paired ? [{ id: "peer", name: "Peer", kind: "module" }] : []),
					{ id: "last", name: "SVG painters", kind: "module" },
					...(unrelated ? [{ id: "end", name: "Other destination", kind: "module" }] : []),
				],
				edges: [
					{ id: "step1", from: "first", to: "second", kind: "call" },
					{ id: "step2", from: "second", to: "middle", kind: "call" },
					...(paired ? [{ id: "peer", from: "middle", to: "peer", kind: "call" }] : []),
					{ id: "step3", from: "middle", to: "last", kind: "call" },
					...(unrelated
						? [
								{ id: "step4", from: "last", to: "end", kind: "call" },
								{
									id: "other",
									from: "middle",
									to: "end",
									kind: "data",
									label: "another destination",
								},
							]
						: []),
					{
						id: "far",
						from: returning ? "last" : "first",
						to: returning ? "first" : "last",
						kind: "data",
						label: "literal colors",
					},
					{
						id: "near",
						from: returning ? "middle" : "second",
						to: returning ? "first" : "last",
						kind: "data",
						label: "placed architecture",
					},
				],
			});
			const other = corridorPoints(
				(await renderArchitecture({ content: base, theme: "light" })).svg,
			).get("other");
			for (const edges of [base.edges, base.edges.toReversed()]) {
				for (const theme of ["light", "dark"] as const) {
					const content = { ...base, edges };
					const drawn = await renderArchitecture({ content, theme });
					const direction = readingOf(drawn);
					const paths = routePoints(drawn.svg);
					const far = paths.get("far")!;
					const near = paths.get("near")!;
					if (!paired) {
						// The farther-reaching route takes the outer lane on its flank:
						// the return flank for returns, the flank beside the chain for skips.
						const outside = returning ? Math.max : Math.min;
						const side = returning ? 1 : -1;
						expect(
							side *
								(outside(...far.map((p) => across(p, direction))) -
									outside(...near.map((p) => across(p, direction)))),
						).toBeGreaterThan(0);
					}
					// A peer may move to either side under compound placement. The
					// routes must clear every card, without assuming old paired seating.
					for (const box of Object.values(drawn.atlas.nodes)) {
						const inside = {
							x: box.x + 1,
							y: box.y + 1,
							width: box.width - 2,
							height: box.height - 2,
						};
						expect(routeCrosses(far, inside)).toBe(false);
						expect(routeCrosses(near, inside)).toBe(false);
					}
					// And arrives farther along the target's face, so the lanes never cross.
					expect(
						(returning ? -1 : 1) * (along(far.at(-1)!, direction) - along(near.at(-1)!, direction)),
					).toBeGreaterThan(0);
					expect(
						far.some((point, index) => {
							const next = far[index + 1];
							return (
								next !== undefined &&
								routeCrosses(near, {
									x: Math.min(point.x, next.x),
									y: Math.min(point.y, next.y),
									width: Math.abs(next.x - point.x),
									height: Math.abs(next.y - point.y),
								})
							);
						}),
					).toBe(false);
					expect(detached(drawn)).toEqual([]);
					expect(covering(drawn)).toEqual([]);
					expect(overlaps(drawn, content, 11.9)).toEqual([]);
					expect(masking(drawn)).toEqual([]);
					if (unrelated) {
						expect(other).toBeDefined();
						expect(corridorPoints(drawn.svg).get("other")).toEqual(other);
					}
				}
			}
		});
	}
});
