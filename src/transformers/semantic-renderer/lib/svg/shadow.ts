import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark, translucent } from "@/transformers/semantic-renderer/lib/svg/colour";
import {
	inset,
	polygonPath,
	translated,
	type Polygon,
} from "@/transformers/semantic-renderer/lib/svg/polygon";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** The farthest a card's shadow reaches below its foot. */
const SHADOW_REACH = 12;
/** Shared gradient samples: continuous interpolation replaces hard silhouette bands. */
const FALLOFF = [1, 0.82, 0.52, 0.16, 0] as const;

/**
 * The shadow's ink on each ground, lighter than a front edge on the light ground.
 * @param palette The theme's colors.
 * @param share How much of it, between 0 and 1.
 * @returns The shadow ink.
 */
function shadowInk(palette: Palette, share = 1): string {
	return lightDark(
		translucent(palette.slabShadow, 0.65 * share),
		translucent(palette.slabShadow, share),
	);
}

/** How many layers the shadow of a shape that is not a box is stacked of. */
const LAYERS = 8;

/**
 * How a layer of a shape's shadow grows with its distance into the shadow: it
 * spreads a little round the shape and moves mostly down, away from the light
 * above, so it shows under the sides that face down and stays hidden under
 * every side that faces up, as a box's shadow lies under its foot.
 */
const SPREAD = { grow: 0.35, x: 0.15, y: 0.75 } as const;

/**
 * How strong the shadow of a box is at a place along its fall.
 * @param position How far along the gradient, from 0 at its start to 1 at its end.
 * @returns Its share of the shadow's ink.
 */
function falloffAt(position: number): number {
	const scaled = Math.min(Math.max(position, 0), 1) * (FALLOFF.length - 1);
	const low = Math.min(Math.floor(scaled), FALLOFF.length - 2);
	return FALLOFF[low]! + (FALLOFF[low + 1]! - FALLOFF[low]!) * (scaled - low);
}

/**
 * The shadow of a shape that is not a box, which a box's patches cannot lie
 * under: the shape grown round its outline and moved down from the light in
 * even steps ({@link SPREAD}), each layer faint enough that where they stack
 * the shadow is as strong as a box's is at that distance from its foot, and so
 * is its fall to nothing at `reach`. Grown rather than only moved, its edge
 * fades the way a box's does instead of repeating the shape's outline beside
 * it. No filter, mask or blur, and no gradient of its own.
 * @param polygon The shape's outline.
 * @param radius How round the shape's corners are, which its shadow's are too.
 * @param reach How far the shadow reaches below and to the right of the shape.
 * @param palette The theme's colors.
 * @returns The shadow's layers, the farthest first.
 */
function polygonShadow(polygon: Polygon, radius: number, reach: number, palette: Palette): string {
	const step = reach / LAYERS;
	const bands = Array.from({ length: LAYERS }, (_, band) =>
		falloffAt(((band + 0.5) * step) / reach),
	);
	const layers = bands.map((strength, band) => {
		// The layers beyond this one reach as far as the next band does: this one adds the rest.
		const share = 1 - (1 - strength) / (1 - (bands[band + 1] ?? 0));
		const distance = (band + 1) * step;
		const grown = inset(polygon, -distance * SPREAD.grow);
		const away = { x: distance * SPREAD.x, y: distance * SPREAD.y };
		return tag("path", {
			d: polygonPath(translated(grown, away), radius + distance * SPREAD.grow),
			fill: shadowInk(palette, share),
		});
	});
	return wrap("g", { "pointer-events": "none" }, lines(layers.toReversed()));
}

/**
 * Eight adjoining patches of one rounded shadow, with matching values at every seam.
 * The card covers their empty center; the sides and corners fade to zero.
 * @param box The block that casts it.
 * @param radius The block's corner radius.
 * @param reach The distance below and to the right of the block.
 * @returns The shadow, without a filter, mask or blur.
 */
function smoothShadow(box: Box, radius: number, reach: number): string {
	const x = box.x - 0.5;
	const y = box.y - 0.5;
	const width = box.width + reach + 0.5;
	const height = box.height + reach + 0.5;
	const r = Math.min(radius + reach, width / 2, height / 2);
	const xs = [x, x + r, x + width - r];
	const ys = [y, y + r, y + height - r];
	const widths = [r, width - 2 * r, r];
	const heights = [r, height - 2 * r, r];
	return wrap(
		"g",
		{ "pointer-events": "none" },
		lines(
			ys.flatMap((top, row) =>
				xs.flatMap((left, column) => {
					if (row === 1 && column === 1) return [];
					return [
						tag("rect", {
							x: coord(left),
							y: coord(top),
							width: coord(widths[column]!),
							height: coord(heights[row]!),
							fill: `url(#ab-shadow-${row}${column})`,
						}),
					];
				}),
			),
		),
	);
}

/**
 * Shared side and corner gradients for all shadow sizes.
 * @param palette The theme's colors.
 * @returns Eight gradients, each defined once in the SVG.
 */
function shadowDefinitions(palette: Palette): string {
	const ink = shadowInk(palette);
	const stops = FALLOFF.map((opacity, index) =>
		tag("stop", {
			offset: index / (FALLOFF.length - 1),
			"stop-color": ink,
			"stop-opacity": opacity,
		}),
	).join("");
	const corners = [
		{ id: "00", cx: 1, cy: 1 },
		{ id: "02", cx: 0, cy: 1 },
		{ id: "20", cx: 1, cy: 0 },
		{ id: "22", cx: 0, cy: 0 },
	];
	const sides = [
		{ id: "01", x1: 0, y1: 1, x2: 0, y2: 0 },
		{ id: "10", x1: 1, y1: 0, x2: 0, y2: 0 },
		{ id: "12", x1: 0, y1: 0, x2: 1, y2: 0 },
		{ id: "21", x1: 0, y1: 0, x2: 0, y2: 1 },
	];
	return lines([
		...corners.map(({ id, ...geometry }) =>
			wrap("radialGradient", { id: `ab-shadow-${id}`, r: 1, ...geometry }, stops),
		),
		...sides.map(({ id, ...geometry }) =>
			wrap("linearGradient", { id: `ab-shadow-${id}`, ...geometry }, stops),
		),
	]);
}

export { SHADOW_REACH, polygonShadow, smoothShadow, shadowDefinitions };
