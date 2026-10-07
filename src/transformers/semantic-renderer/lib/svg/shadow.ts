import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lightDark, translucent } from "@/transformers/semantic-renderer/lib/svg/colour";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** The farthest a card's shadow reaches below its foot. */
const SHADOW_REACH = 12;
/** Shared gradient samples: continuous interpolation replaces hard silhouette bands. */
const FALLOFF = [1, 0.82, 0.52, 0.16, 0] as const;

/**
 * The shadow's ink on each ground, lighter than a front edge on the light ground.
 * @param palette The theme's colors.
 * @returns The shadow ink.
 */
function shadowInk(palette: Palette): string {
	return lightDark(translucent(palette.slabShadow, 0.65), palette.slabShadow);
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

export { SHADOW_REACH, smoothShadow, shadowDefinitions };
