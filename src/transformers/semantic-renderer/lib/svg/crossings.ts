import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, inflate } from "@/transformers/semantic-renderer/lib/geometry";
import type { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { curveBounds, pathOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { strokeWidthOf } from "@/transformers/semantic-renderer/lib/svg/styles";

/**
 * An id that is the same for the same mask markup, in every place the
 * renderer runs: two 32-bit FNV-1a hashes with different offsets, as 20 hex
 * digits. Synchronous and free of any runtime API, unlike a digest, and wide
 * enough that two different masks on one page do not share an id.
 * @param body The mask's markup.
 * @returns The id.
 */
function contentId(body: string): string {
	let one = 0x811c9dc5;
	let other = 0x01000193;
	for (let index = 0; index < body.length; index += 1) {
		const code = body.charCodeAt(index);
		one = Math.imul(one ^ code, 0x01000193) >>> 0;
		other = Math.imul(other ^ code, 0x811c9dc5) >>> 0;
	}
	const length = (body.length >>> 0).toString(16).padStart(4, "0").slice(-4);
	return `${one.toString(16).padStart(8, "0")}${other.toString(16).padStart(8, "0")}${length}`;
}

/** A restrained sliver of clear space on each side of the upper arc. */
const BRIDGE_INK_GAP = 1.5;

/**
 * Clear lower ink narrowly beneath each upper arc, revealing the actual backdrop.
 * @param edges Final bridged routes; local masks also allow an earlier route to rise.
 * @param bridges Local upper curves and the lower connections they cross.
 * @returns Mask definitions and the mask identity for each affected lower route.
 */
function crossingMasks(
	edges: readonly DrawingEdge[],
	bridges: ReturnType<typeof bridgeCrossings>["bridges"],
): { definitions: string; masks: ReadonlyMap<string, string> } {
	const byId = new Map(edges.map((route) => [route.edge.id, route]));
	const cutouts = new Map<string, string[]>();
	for (const bridge of bridges) {
		const upper = byId.get(bridge.edgeId)!;
		const cutout = tag("path", {
			d: pathOf(bridge.curve),
			fill: "none",
			stroke: "black",
			"stroke-width": strokeWidthOf(upper.edge) + BRIDGE_INK_GAP * 2,
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		});
		for (const id of bridge.under) {
			const paths = cutouts.get(id) ?? [];
			paths.push(cutout);
			cutouts.set(id, paths);
		}
	}
	const masks = new Map<string, string>();
	const definitions: string[] = [];
	for (const [edgeId, paths] of cutouts) {
		// Keep the full lower stroke, selection halo and endpoints inside the mask.
		const box = inflate(curveBounds(byId.get(edgeId)!.curve), 18);
		const bounds = {
			x: coord(box.x),
			y: coord(box.y),
			width: coord(box.width),
			height: coord(box.height),
		};
		const body = tag("rect", { ...bounds, fill: "white" }) + paths.join("");
		// Panes and variants share an SVG ID namespace; identical IDs mean identical masks.
		const id = `crossing-${contentId(body)}`;
		masks.set(edgeId, id);
		definitions.push(
			wrap(
				"mask",
				{ id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse", ...bounds },
				body,
			),
		);
	}
	return {
		definitions: definitions.length === 0 ? "" : wrap("defs", {}, definitions.join("")),
		masks,
	};
}

export { crossingMasks };
