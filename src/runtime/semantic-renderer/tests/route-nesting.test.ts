// Shared-destination routes coordinate their lane and arrival-port order, and
// two relationships between the same pair of cards stay tellable apart.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { across, along, breadth, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import {
	corridorPoints,
	routePoints,
	routeCrosses,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import {
	detached,
	covering,
	overlaps,
	masking,
} from "@/runtime/semantic-renderer/tests/drawn-labels";

/**
 * The flank rule a drawing was kept under.
 * @param svg The rendered document.
 * @returns The rule's name.
 */
function ruleOf(svg: string): string | undefined {
	return /data-flank-rule="([^"]+)"/u.exec(svg)?.[1];
}

/**
 * Whether one drawn route crosses another.
 * @param one The route.
 * @param other The route it must stay clear of.
 * @returns True when any segment of one reaches into the other.
 */
function crosses(one: readonly DrawnPoint[], other: readonly DrawnPoint[]): boolean {
	return one.some((point, index) => {
		const next = one[index + 1];
		return (
			next !== undefined &&
			routeCrosses(other, {
				x: Math.min(point.x, next.x),
				y: Math.min(point.y, next.y),
				width: Math.abs(next.x - point.x),
				height: Math.abs(next.y - point.y),
			})
		);
	});
}

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
			const reference = await renderArchitecture({ content: base, theme: "light" });
			const other = corridorPoints(reference.svg).get("other");
			for (const edges of [base.edges, base.edges.toReversed()]) {
				for (const theme of ["light", "dark"] as const) {
					const content = { ...base, edges };
					const drawn = await renderArchitecture({ content, theme });
					const direction = readingOf(drawn);
					const paths = routePoints(drawn.svg);
					const far = paths.get("far")!;
					const near = paths.get("near")!;
					if (!paired) {
						// The farther-reaching route takes the outer lane on the flank the
						// pair runs down, whichever flank the drawing's rule gives them
						// (docs/design/layout-rules.md section 21).
						const target = drawn.atlas.nodes[returning ? "first" : "last"]!;
						const centre = across(target, direction) + breadth(target, direction) / 2;
						const lanes = near.map((p) => across(p, direction));
						const side = Math.max(...lanes) > centre + breadth(target, direction) / 2 ? 1 : -1;
						const outside = side > 0 ? Math.max : Math.min;
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
					expect(crosses(far, near)).toBe(false);
					expect(detached(drawn)).toEqual([]);
					expect(covering(drawn)).toEqual([]);
					expect(overlaps(drawn, content, 11.9)).toEqual([]);
					expect(masking(drawn)).toEqual([]);
					// Nesting the pair leaves an unrelated route where it was. The
					// engine's placement depends on the order relationships are
					// listed in, so a first render may keep a different flank rule
					// for another order; under the same rule the route is the same.
					if (unrelated && ruleOf(drawn.svg) === ruleOf(reference.svg)) {
						expect(other).toBeDefined();
						expect(corridorPoints(drawn.svg).get("other")).toEqual(other);
					}
				}
			}
		});
	}
});

describe("relationships between the same pair of cards", () => {
	// Both ends of such a relationship are ranked by the card at the other end,
	// so without a seat of its own each takes the same port index as its
	// neighbour and the engine's opposite walks of the two faces invert them
	// (TASK-256.11). Crossed, a reader cannot tell which label belongs to which
	// arrowhead.
	const signals = ["request timing", "error counter", "queue depth"];
	for (const count of [2, 3]) {
		test(`${count} of them neither cross nor swap ends`, async () => {
			const base = VariantContentSchema.parse({
				nodes: [
					{ id: "app", name: "Flask app", kind: "module" },
					{ id: "metrics", name: "Metrics extension", kind: "module" },
				],
				edges: signals.slice(0, count).map((label, place) => ({
					id: `signal${place + 1}`,
					from: "app",
					to: "metrics",
					kind: "signal",
					label,
				})),
			});
			for (const edges of [base.edges, base.edges.toReversed()]) {
				for (const theme of ["light", "dark"] as const) {
					const content = { ...base, edges };
					const drawn = await renderArchitecture({ content, theme });
					const direction = readingOf(drawn);
					// The corridors, not the ink: a bridge lifts the later route
					// over the earlier one, so the ink of a crossing pair does not
					// meet even though a reader still has two lines to follow.
					const paths = corridorPoints(drawn.svg);
					const routes = base.edges.map(({ id }) => paths.get(id)!);
					for (const [index, route] of routes.entries()) {
						expect(route, `${base.edges[index]!.id} is drawn`).toBeDefined();
						for (const [other, against] of routes.entries()) {
							if (other === index) continue;
							expect(
								crosses(route, against),
								`${base.edges[index]!.id} crosses ${base.edges[other]!.id}`,
							).toBe(false);
						}
					}
					// And each leaves and arrives in the same place across the
					// reading as its neighbours, so no two share an end either.
					const departures = routes.map((route) => across(route[0]!, direction));
					const arrivals = routes.map((route) => across(route.at(-1)!, direction));
					for (const [index] of routes.entries()) {
						for (const [other] of routes.entries()) {
							if (other === index) continue;
							expect(
								Math.sign(departures[index]! - departures[other]!),
								`${base.edges[index]!.id} against ${base.edges[other]!.id}`,
							).toBe(Math.sign(arrivals[index]! - arrivals[other]!));
							expect(departures[index]).not.toBe(departures[other]);
						}
					}
					expect(detached(drawn)).toEqual([]);
					expect(masking(drawn)).toEqual([]);
					expect(overlaps(drawn, content, 11.9)).toEqual([]);
				}
			}
		});
	}
});
