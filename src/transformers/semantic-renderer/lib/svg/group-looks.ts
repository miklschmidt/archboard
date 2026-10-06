// PROTOTYPE (TASK-416), to be removed once the owner picks one look: the
// drawing of three looks for a group region (`regions.ts` chooses one).
import { BAND_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { DrawingRegion, TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import type { Tone } from "@/transformers/semantic-renderer/lib/svg/colour";
import { lines, tag } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";

// PROTOTYPE (TASK-416), to be removed once the owner picks one look. Three
// looks for a group region, chosen by ARCHBOARD_GROUP_LOOK, which only a server
// reads: "a" a thick frame with a solid tab grown from its corner, "b" a
// solid banner across the top with thin sides, "c" thick corner brackets with
// a solid tab. Absent, the region keeps its current look.
const GROUP_LOOK: string | undefined =
	typeof process === "undefined" ? undefined : process.env["ARCHBOARD_GROUP_LOOK"];
/** The solid colour of a frame, a banner, a bracket and a solid tab, and the words on it. */
const SOLID: Tone = {
	light: { lightness: 0.72, chroma: 1 },
	dark: { lightness: 0.66, chroma: 0.95 },
};
const SOLID_INK: Tone = {
	light: { lightness: 0.22, chroma: 0.4 },
	dark: { lightness: 0.2, chroma: 0.4 },
};
/** Look a: how thick the frame is. Look b: how tall the banner is near, its words' size, and its sides. */
const FRAME = 4;
const BANNER = 24;
const BANNER_WORDS = 15;
const BANNER_SIDE = 2;
/** Look c: how thick a corner bracket is, and how long each of its arms. */
const BRACKET = 4;
const ARM = 28;

/**
 * PROTOTYPE (TASK-416): a rounded outline round a box, its outer edge on the box.
 * @param box The box.
 * @param width How thick the outline is.
 * @param ink Its colour.
 * @returns The outline.
 */
function outline(box: Box, width: number, ink: string): string {
	const inset = width / 2;
	return tag("rect", {
		x: coord(box.x + inset),
		y: coord(box.y + inset),
		width: coord(box.width - width),
		height: coord(box.height - width),
		rx: coord(BAND_RADIUS - inset),
		fill: "none",
		stroke: ink,
		"stroke-width": width,
	});
}

/**
 * PROTOTYPE (TASK-416), look c: four thick brackets, one round each corner of a box.
 * @param box The box.
 * @param ink Their colour.
 * @returns The brackets.
 */
function brackets(box: Box, ink: string): string {
	const inset = BRACKET / 2;
	const radius = BAND_RADIUS - inset;
	const left = box.x + inset;
	const right = box.x + box.width - inset;
	const top = box.y + inset;
	const bottom = box.y + box.height - inset;
	const corners: readonly [number, number, number, number][] = [
		[left, top, 1, 1],
		[right, top, -1, 1],
		[right, bottom, -1, -1],
		[left, bottom, 1, -1],
	];
	return lines(
		corners.map(([x, y, across, down]) => {
			// Clockwise from the top-left, so every arc turns the same way.
			const sweep = across * down > 0 ? 1 : 0;
			const start = `${coord(x)},${coord(y + down * ARM)}`;
			const arcFrom = `${coord(x)},${coord(y + down * radius)}`;
			const arcTo = `${coord(x + across * radius)},${coord(y)}`;
			const end = `${coord(x + across * ARM)},${coord(y)}`;
			return tag("path", {
				d: `M${start} L${arcFrom} A${coord(radius)},${coord(radius)} 0 0 ${sweep} ${arcTo} L${end}`,
				fill: "none",
				stroke: ink,
				"stroke-width": BRACKET,
			});
		}),
	);
}

/**
 * PROTOTYPE (TASK-416), look b: a solid banner across the whole top of the
 * region with the caption in it: low near, as tall as the caption's row from
 * far away, its words at the start or, where the tab would stand at the end,
 * at the end.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param place Whether the words stand at the end, and whether this is the far view.
 * @param place.atEnd Whether the words stand at the end of the banner.
 * @param place.far Whether the banner is drawn from far away.
 * @param look The group's colours, and the page's.
 * @param look.colours The group's colours.
 * @param look.colours.solid The banner's colour.
 * @param look.colours.solidInk The colour of the words on it.
 * @param look.palette The page's colours.
 * @returns The banner and its words.
 */
function banner(
	region: DrawingRegion,
	run: TextRun,
	{ atEnd, far }: { atEnd: boolean; far: boolean },
	{ colours, palette }: { colours: { solid: string; solidInk: string }; palette: Palette },
): string {
	const { box, caption } = region;
	const height = far ? caption.box.y + caption.box.height - box.y : BANNER;
	const size = far ? run.fontSize : BANNER_WORDS;
	const width = measure(run.text, run.font, size);
	const margin = caption.box.x + run.x - box.x;
	const words = {
		...run,
		fontSize: size,
		width,
		x: atEnd ? box.width - margin - width : margin,
		y: height / 2 + size * 0.35,
	};
	const { x, y } = box;
	const right = x + box.width;
	return lines([
		tag("path", {
			d: [
				`M${coord(x)},${coord(y + height)}`,
				`V${coord(y + BAND_RADIUS)}`,
				`A${BAND_RADIUS},${BAND_RADIUS} 0 0 1 ${coord(x + BAND_RADIUS)},${coord(y)}`,
				`H${coord(right - BAND_RADIUS)}`,
				`A${BAND_RADIUS},${BAND_RADIUS} 0 0 1 ${coord(right)},${coord(y + BAND_RADIUS)}`,
				`V${coord(y + height)}`,
				"Z",
			].join(" "),
			fill: colours.solid,
		}),
		paintTextRuns([words], box, palette, colours.solidInk),
	]);
}

export { BANNER_SIDE, FRAME, GROUP_LOOK, SOLID, SOLID_INK, banner, brackets, outline };
