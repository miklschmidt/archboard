// Group regions (TASK-347): the cards one group places inside one container,
// gathered inside a boundary of the group's colour with the group's name on a
// tab in its corner. The region has no face of its own (TASK-415): what it lies
// on, the page or a tray's floor, shows through it, and the group's colour is
// carried by the cards in it, by a hairline round it and by a foot along its
// bottom, as thick as a thin block's front edge (`slab.ts`). The tab is a small
// block raised a step off one of the region's top corners, inside the region's
// box. It is never an obstacle for the layout: lines cross it, and it takes no
// pointer, so whatever lies inside it is picked as before. It keeps clear of the
// lines itself, though: it stands in the corner no route runs down through, and
// from far away it grows only as far as the nearest route.
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import {
	BAND_RADIUS,
	REGION_FOOT,
	TAB_THICKNESS,
} from "@/transformers/semantic-renderer/lib/design";
import type { DrawingRegion, TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { segmentStart, type Curve } from "@/transformers/semantic-renderer/lib/layout/curves";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { toned, type Tone } from "@/transformers/semantic-renderer/lib/svg/colour";
import { farLayer, nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { GLINT_WIDTH, castShadow, glintOf } from "@/transformers/semantic-renderer/lib/svg/slab";
import { MEMBERS_ATTRIBUTE } from "@/transformers/semantic-renderer/lib/svg/standing";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";
import {
	BANNER_SIDE,
	FRAME,
	GROUP_LOOK,
	SOLID,
	SOLID_INK,
	banner,
	brackets,
	outline,
} from "@/transformers/semantic-renderer/lib/svg/group-looks";

/**
 * The group's colour on the region's boundary, its tab's face and its tab's
 * edge: each a tone of the group's own hue (`toned`), the same on the page, on
 * a tray's floor and on a nested floor. The boundary, the hairline round the
 * region and the foot along its bottom, is the colour at a middle lightness.
 * The tab is a clear tone of it, and its edge is quieter than the foot, the
 * thickness of a label rather than a rule under it.
 */
const BOUNDARY: Tone = {
	light: { lightness: 0.8, chroma: 0.7 },
	dark: { lightness: 0.43, chroma: 0.62 },
};
const TAB_FACE: Tone = {
	light: { lightness: 0.885, chroma: 0.46 },
	dark: { lightness: 0.315, chroma: 0.48 },
};
const TAB_EDGE: Tone = {
	light: { lightness: 0.83, chroma: 0.6 },
	dark: { lightness: 0.4, chroma: 0.55 },
};
/** How wide the hairline round a region is. */
const HAIRLINE = 1;
/** The tab's own rounded corner; the rounded one it shares with the region is the region's. */
const TAB_RADIUS = 8;
/**
 * The caption's words: the group's colour, deep on the light ground and light
 * on the dark, one lightness for every colour, so a light colour such as yellow
 * keeps its words at 4.5:1 on its tab as a deep one does.
 */
const CAPTION: Tone = {
	light: { lightness: 0.44, chroma: 0.9 },
	dark: { lightness: 0.88, chroma: 0.6 },
};

/**
 * How much of its row a group's caption may take from far away: set larger,
 * its words crowd the cards under it.
 */
const FAR_CAPTION_SHARE = 0.62;

/** How far a caption's tab keeps from a route that crosses its row. */
const ROUTE_ROOM = 8;

/** A group's colours: its region's boundary, its tab's face and edge, and its caption's words. */
interface GroupColours {
	readonly boundary: string;
	readonly tab: string;
	readonly tabEdge: string;
	readonly words: string;
	/** PROTOTYPE (TASK-416): the solid colour of looks a, b and c, and the words on it. */
	readonly solid: string;
	readonly solidInk: string;
}

/** Which of the region's top corners a tab stands in: the one its words start from, or the other. */
type Corner = "start" | "end";

/** Where a route crosses a caption's row, from its leftmost ink to its rightmost. */
interface Crossing {
	readonly left: number;
	readonly right: number;
}

/**
 * A tab's outline, the one shape every layer of the tab is drawn in (its
 * shadow, its foot, its highlight and its face), so they cannot disagree: the
 * top corner on the region's wall rounded as the region's own corner, the corner
 * diagonally across from it rounded as the tab's own, and the other two
 * square, where its foot meets the region's wall and where its top meets the
 * region's top edge.
 * @param box The tab, or a layer of its shadow.
 * @param corner Which of the region's top corners it stands in.
 * @param grow How much larger a shadow's layer is, which rounds its corners as much more.
 * @returns Its path.
 */
function tabPath(box: Box, corner: Corner, grow = 0): string {
	const { x, y, width, height } = box;
	const shared = Math.min(BAND_RADIUS + grow, width / 2, height / 2);
	const own = Math.min(TAB_RADIUS + grow, width / 2, height / 2);
	const foot = y + height;
	/**
	 * A distance in from the region's wall, as a page coordinate.
	 * @param inward How far in.
	 * @returns The coordinate.
	 */
	const at = (inward: number): string =>
		coord(corner === "start" ? x + inward : x + width - inward);
	// A tab in the end corner is the start corner's mirror, so it turns the other way.
	const sweep = corner === "start" ? 1 : 0;
	return [
		`M${at(0)},${coord(foot)}`,
		`V${coord(y + shared)}`,
		`A${coord(shared)},${coord(shared)} 0 0 ${sweep} ${at(shared)},${coord(y)}`,
		`H${at(width)}`,
		`V${coord(foot - own)}`,
		`A${coord(own)},${coord(own)} 0 0 ${sweep} ${at(width - own)},${coord(foot)}`,
		"Z",
	].join(" ");
}

/**
 * Where a tab for some words stands: as wide as the words and their margin on
 * either side, the margin grown with the words, and as tall as the caption's
 * row, in the corner it is given. Its words move with it.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param corner Which of the region's top corners it stands in.
 * @param grown How much larger than near the words are set.
 * @returns The tab's box, and how far right of where they were measured its words stand.
 */
function tabBox(
	region: DrawingRegion,
	run: TextRun,
	corner: Corner,
	grown: number,
): { readonly box: Box; readonly shift: number } {
	const { box, caption } = region;
	const margin = caption.box.x + run.x - box.x;
	const width = Math.min(box.width, margin * (1 + grown) + run.width);
	const x = corner === "start" ? box.x : box.x + box.width - width;
	return {
		box: { x, y: box.y, width, height: caption.box.y + caption.box.height - box.y },
		shift: x - box.x,
	};
}

/**
 * A caption on its tab: the tab a small slab of its own on the region's corner,
 * casting a short shadow on what the region lies on, and the words on it.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param place Which corner the tab stands in, and how much larger than near the words are.
 * @param place.corner Which of the region's top corners the tab stands in.
 * @param place.grown How much larger than near the words are set.
 * @param look The group's colours, and the page's.
 * @param look.colours The group's colours.
 * @param look.palette The page's colours.
 * @returns The tab and its words.
 */
function captionTab(
	region: DrawingRegion,
	run: TextRun,
	{ corner, grown }: { corner: Corner; grown: number },
	{ colours, palette }: { colours: GroupColours; palette: Palette },
): string {
	const { box: whole, shift } = tabBox(region, run, corner, grown);
	const face = { ...whole, height: whole.height - TAB_THICKNESS };
	const lit = { ...face, y: face.y + GLINT_WIDTH, height: face.height - GLINT_WIDTH };
	return lines([
		castShadow(whole, "tab", palette, (layer, grow, paint) =>
			tag("path", { d: tabPath(layer, corner, grow), ...paint }),
		),
		tag("path", { d: tabPath(whole, corner), fill: colours.tabEdge }),
		tag("path", { d: tabPath(face, corner), fill: glintOf(colours.tab, palette) }),
		tag("path", { d: tabPath(lit, corner), fill: colours.tab }),
		paintTextRuns(
			[run],
			{ ...region.caption.box, x: region.caption.box.x + shift },
			palette,
			colours.words,
		),
	]);
}

/**
 * The colours one group's region is drawn in.
 * @param ink The group's colour.
 * @returns The boundary's, the tab's and the caption's.
 */
function matColours(ink: string): GroupColours {
	return {
		boundary: toned(ink, BOUNDARY),
		tab: toned(ink, TAB_FACE),
		tabEdge: toned(ink, TAB_EDGE),
		words: toned(ink, CAPTION),
		solid: toned(ink, SOLID),
		solidInk: toned(ink, SOLID_INK),
	};
}

/**
 * PROTOTYPE (TASK-416), looks a and c: the caption on a flat tab of the solid
 * colour, which merges with the frame or the corner bracket under it.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param place Which corner the tab stands in, and how much larger than near the words are.
 * @param place.corner Which of the region's top corners the tab stands in.
 * @param place.grown How much larger than near the words are set.
 * @param look The group's colours, and the page's.
 * @param look.colours The group's colours.
 * @param look.palette The page's colours.
 * @returns The tab and its words.
 */
function solidTab(
	region: DrawingRegion,
	run: TextRun,
	{ corner, grown }: { corner: Corner; grown: number },
	{ colours, palette }: { colours: GroupColours; palette: Palette },
): string {
	const { box, shift } = tabBox(region, run, corner, grown);
	return lines([
		tag("path", { d: tabPath(box, corner), fill: colours.solid }),
		paintTextRuns(
			[run],
			{ ...region.caption.box, x: region.caption.box.x + shift },
			palette,
			colours.solidInk,
		),
	]);
}

/**
 * PROTOTYPE (TASK-416): the caption in the look the server was asked for.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param place Which corner the tab stands in, how much larger than near the words are, and whether this is the far view.
 * @param place.corner Which of the region's top corners the tab stands in.
 * @param place.grown How much larger than near the words are set.
 * @param place.far Whether the caption is drawn from far away.
 * @param look The group's colours, and the page's.
 * @param look.colours The group's colours.
 * @param look.palette The page's colours.
 * @returns The caption.
 */
function captionIn(
	region: DrawingRegion,
	run: TextRun,
	place: { corner: Corner; grown: number; far: boolean },
	look: { colours: GroupColours; palette: Palette },
): string {
	if (GROUP_LOOK === "b")
		return banner(region, run, { atEnd: place.corner === "end", far: place.far }, look);
	if (GROUP_LOOK === "a" || GROUP_LOOK === "c") return solidTab(region, run, place, look);
	return captionTab(region, run, place, look);
}

/**
 * PROTOTYPE (TASK-416): the region's boundary in the look the server was asked for.
 * @param box The region's box.
 * @param colours The group's colours.
 * @returns The boundary.
 */
function boundaryIn(box: Box, colours: GroupColours): string {
	if (GROUP_LOOK === "a") return outline(box, FRAME, colours.solid);
	if (GROUP_LOOK === "b") return outline(box, BANNER_SIDE, colours.solid);
	if (GROUP_LOOK === "c") return brackets(box, colours.solid);
	return boundary(box, colours.boundary);
}

/**
 * A region's boundary: a hairline round its box, and a foot along its bottom
 * as thick as a thin block's front edge, following the box's rounded corners.
 * Nothing fills it.
 * @param box The region's box.
 * @param ink The boundary's colour.
 * @returns The hairline and the foot.
 */
function boundary(box: Box, ink: string): string {
	const { x, y, width, height } = box;
	const foot = y + height - REGION_FOOT;
	// Where the foot's top meets the curve of a bottom corner.
	const reach = BAND_RADIUS - Math.sqrt(BAND_RADIUS ** 2 - (BAND_RADIUS - REGION_FOOT) ** 2);
	return lines([
		// On the box's own edge, so the region's first shape is its box.
		tag("rect", {
			x: coord(x),
			y: coord(y),
			width: coord(width),
			height: coord(height),
			rx: BAND_RADIUS,
			fill: "none",
			stroke: ink,
			"stroke-width": HAIRLINE,
		}),
		tag("path", {
			d: [
				`M${coord(x + reach)},${coord(foot)}`,
				`H${coord(x + width - reach)}`,
				`A${BAND_RADIUS},${BAND_RADIUS} 0 0 1 ${coord(x + width - BAND_RADIUS)},${coord(y + height)}`,
				`H${coord(x + BAND_RADIUS)}`,
				`A${BAND_RADIUS},${BAND_RADIUS} 0 0 1 ${coord(x + reach)},${coord(foot)}`,
				"Z",
			].join(" "),
			fill: ink,
		}),
	]);
}

/**
 * Where the picture's routes cross a caption's row, the band from the top of
 * the region to the foot of its tab.
 * @param region The region.
 * @param routes Every route the picture draws.
 * @returns Each piece of a route that crosses the row, by how far across it reaches.
 */
function crossingsOf(region: DrawingRegion, routes: readonly Curve[]): Crossing[] {
	const top = region.box.y;
	const bottom = region.caption.box.y + region.caption.box.height;
	return routes.flatMap((curve) =>
		curve.segments.flatMap((segment, index) => {
			const points = [segmentStart(curve, index), segment.to];
			if (segment.kind === "cubic") points.push(segment.first, segment.second);
			const ys = points.map(({ y }) => y);
			if (Math.min(...ys) >= bottom || Math.max(...ys) <= top) return [];
			const xs = points.map(({ x }) => x);
			return [{ left: Math.min(...xs), right: Math.max(...xs) }];
		}),
	);
}

/**
 * Whether no route crosses a tab, with room to spare either side of it.
 * @param box The tab.
 * @param crossings Where routes cross its row.
 * @returns True when the tab is clear.
 */
function clearOf(box: Box, crossings: readonly Crossing[]): boolean {
	return crossings.every(
		({ left, right }) => right < box.x - ROUTE_ROOM || left > box.x + box.width + ROUTE_ROOM,
	);
}

/**
 * The corner a caption's tab stands in: the one its words start from, unless
 * a route runs down through the tab there and none would at the other.
 * @param region The region.
 * @param run The caption's words as drawn near.
 * @param crossings Where routes cross its row.
 * @returns The corner.
 */
function cornerOf(region: DrawingRegion, run: TextRun, crossings: readonly Crossing[]): Corner {
	/**
	 * Whether a route runs through the near tab in a corner.
	 * @param corner The corner.
	 * @returns True when one does.
	 */
	const blocked = (corner: Corner): boolean =>
		!clearOf(tabBox(region, run, corner, 1).box, crossings);
	return blocked("start") && !blocked("end") ? "end" : "start";
}

/**
 * Paint one group's region: its boundary, and its caption on its tab, drawn
 * near and from far away. The hairline is its first shape, in the region's box.
 * @param region The region.
 * @param look The page's colours, the vault's policy for the group's colour,
 * the size of the picture's card names from far away, and the picture's routes.
 * @param look.palette The page's colours.
 * @param look.policy The vault's policy.
 * @param look.farSize The size of the picture's card names from far away.
 * @param look.routes Every route the picture draws, which a caption's tab keeps clear of.
 * @returns The region's SVG.
 */
function paintRegion(
	region: DrawingRegion,
	{
		palette,
		policy,
		farSize,
		routes,
	}: {
		palette: Palette;
		policy: SemanticPolicy;
		farSize: number;
		routes: readonly Curve[];
	},
): string {
	const ink = semanticInk(policy.groups[region.group]?.color) ?? palette.muted;
	const colours = matColours(ink);
	const near = region.caption.measured.runs[0];
	const crossings = crossingsOf(region, routes);
	const corner = near === undefined ? "start" : cornerOf(region, near, crossings);
	const look = { colours, palette };
	return wrap(
		"g",
		{
			"data-semantic-kind": "group-region",
			"data-group": region.group,
			[MEMBERS_ATTRIBUTE]: region.members.join(" "),
			"pointer-events": "none",
		},
		lines([
			boundaryIn(region.box, colours),
			near === undefined
				? ""
				: nearLayer(captionIn(region, near, { corner, grown: 1, far: false }, look)) +
					farCaption(region, near, { farSize, corner, crossings }, look),
		]),
	);
}

/**
 * How wide a caption's tab may grow from far away: from its corner to a little
 * short of the nearest route that crosses the caption's row beyond its near
 * words, or to the region's far wall. A route that crosses the row within the
 * near words crosses the near tab too, and is the layout's to keep clear.
 * @param region The region.
 * @param run The caption's words as drawn near.
 * @param corner Which of the region's top corners the tab stands in.
 * @param crossings Where routes cross the caption's row.
 * @returns The widest the tab may be.
 */
function farRoom(
	region: DrawingRegion,
	run: TextRun,
	corner: Corner,
	crossings: readonly Crossing[],
): number {
	const { box } = region;
	const near = tabBox(region, run, corner, 1).box;
	if (corner === "start") {
		const words = near.x + near.width;
		const stops = crossings.filter(({ left }) => left > words).map(({ left }) => left);
		return Math.min(box.x + box.width, ...stops.map((stop) => stop - ROUTE_ROOM)) - box.x;
	}
	const stops = crossings.filter(({ right }) => right < near.x).map(({ right }) => right);
	return box.x + box.width - Math.max(box.x, ...stops.map((stop) => stop + ROUTE_ROOM));
}

/**
 * A group's caption from far away: one line as large as its row holds, up to
 * the size of the picture's card names, on a tab grown to hold it in the same
 * corner, which never reaches past its region's wall or into a route crossing
 * its row ({@link farRoom}). It is never set smaller than near.
 * @param region The region.
 * @param run The caption's words as drawn near.
 * @param far The size of the picture's card names from far away, the tab's corner,
 * and where routes cross the caption's row.
 * @param far.farSize The size of the picture's card names from far away.
 * @param far.corner Which of the region's top corners the tab stands in.
 * @param far.crossings Where routes cross the caption's row.
 * @param look The group's colours, and the page's.
 * @param look.colours The group's colours.
 * @param look.palette The page's colours.
 * @returns The far layer.
 */
function farCaption(
	region: DrawingRegion,
	run: TextRun,
	{
		farSize,
		corner,
		crossings,
	}: { farSize: number; corner: Corner; crossings: readonly Crossing[] },
	look: { colours: GroupColours; palette: Palette },
): string {
	const { box, caption } = region;
	// The tab is the words' margin before them and as much again after them,
	// both grown with the words (`tabBox`): its width at a size is linear in it.
	const margin = caption.box.x + run.x - box.x;
	const room = farRoom(region, run, corner, crossings);
	const size = Math.max(
		run.fontSize,
		Math.min(
			farSize,
			caption.box.height * FAR_CAPTION_SHARE,
			(run.fontSize * (room - margin)) / Math.max(1, margin + run.width),
		),
	);
	const grown = {
		...run,
		fontSize: size,
		width: measure(run.text, run.font, size),
		// The baseline stands half a cap height below the row's middle.
		y: caption.box.height / 2 + size * 0.35,
	};
	return farLayer(
		captionIn(region, grown, { corner, grown: size / run.fontSize, far: true }, look),
	);
}

export { paintRegion };
