// The contract between placed cards and Track: measure real port demand
// before settling routes, so a crowded card can be placed again at its width.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { CardLayout } from "#shared/rules/blocks/cards/card-layout.ts";
import type { Laid } from "#shared/rules/blocks/tree/laid.ts";
import { markRegions, letPortsSlide, rimOf } from "#shared/rules/blocks/folds/leaves.ts";
import {
	besideWalls,
	markBesides,
	wallsOf,
	besidePoints,
} from "#shared/rules/blocks/packing/walls.ts";
import { Scene } from "#shared/rules/track/scene/scene.ts";
import { routeScene, trunkKind } from "#shared/rules/track/routes/route.ts";

/**
 * Measure the placed block's ports before routing its lines on tracks.
 * @param layout The block's placement owner.
 * @param placed The placed block.
 * @param held The width the block keeps at least.
 * @returns Required card widths and the remaining routing operation.
 */
function prepareCardRouting(
	layout: CardLayout,
	placed: ElkNode & { edges: ElkExtendedEdge[] },
	held: number,
): { widths: ReadonlyMap<string, number>; lay: () => Laid } {
	const scene = new Scene(placed);
	scene.edgesPage = layout.block.kind === "root" && layout.tree.nesting !== "blocks";
	scene.inline = layout.tree.nesting !== "blocks";
	markRegions(scene, layout.block, layout.tree);
	letPortsSlide(scene, layout.block, layout.tree.nesting);
	const beside = besideWalls(layout.block, layout.tree, scene);
	const straight = new Set(beside.map(({ key }) => key));
	markBesides(scene, beside);
	const routing = routeScene(
		scene,
		placed.edges
			.filter((edge) => !straight.has(edge.id))
			.map((edge) => {
				const line = layout.block.lines.get(edge.id)!;
				return {
					id: edge.id,
					order: Number(edge.layoutOptions?.["archboard.order"] ?? 0),
					kind: trunkKind(edge),
					placed: edge,
					...wallsOf(layout.block, line),
				};
			}),
		layout.insets.side,
		layout.insets.top,
		rimOf(layout.block, layout.insets),
	);
	return {
		widths: new Map(
			[...scene.cards].flatMap(([name, item]) =>
				routing.widths.has(item) ? [[name, routing.widths.get(item)!] as const] : [],
			),
		),
		/**
		 * Route and read the block once its card widths fit.
		 * @returns The laid-out block.
		 */
		lay: () => {
			const lines = routing.route();
			for (const [key, points] of besidePoints(scene, beside, layout.insets.side))
				lines.set(key, points);
			return layout.read(scene, lines, new Map(placed.edges.map((edge) => [edge.id, edge])), held);
		},
	};
}

export { prepareCardRouting };
