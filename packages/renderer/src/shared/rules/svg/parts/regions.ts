// Group regions (TASK-347): the cards one group places inside one container,
// gathered inside a frame of the group's colour with the group's name on a tab
// in its corner (TASK-419). The region has no face of its own (TASK-415): what
// it lies on, the page or a tray's floor, shows through it. A thin frame in a
// faded tone of the group's colour shows its extent, thick brackets in the full
// colour mark its four corners, and the tab, in the full colour, is grown out
// of the bracket of its corner, so the tab and the frame read as one shape. The
// cards in it carry the group's colour on their faces and front edges. The tab
// stands inside the region's box. It is never an obstacle for the layout: lines
// cross it, and it takes no pointer, so whatever lies inside it is picked as
// before. It keeps clear of the lines itself, though: it stands in the corner no
// route runs down through, and from far away it grows only as far as the
// nearest route.
import type { SemanticPolicy } from "@archboard/board/policy";
import type { PaletteColor } from "#shared/rules/render/semantic-appearance.ts";
import { BAND_RADIUS } from "#shared/constants/design.ts";
import type { DrawingRegion, TextRun } from "#shared/rules/render/drawing.ts";
import { coord, type Box } from "#shared/rules/geometry.ts";
import { segmentStart, type Curve } from "#shared/rules/layout/routes/curves.ts";
import { token, type Palette } from "#shared/rules/svg/page/theme.ts";
import { measure } from "#shared/rules/text/text.ts";
import { semanticInk } from "#shared/rules/svg/parts/appearance.ts";
import { heldTone, toned, type Held, type Tone } from "#shared/rules/svg/page/colour.ts";
import { farLayer, nearLayer } from "#shared/rules/svg/parts/far-view.ts";
import { lines, tag, wrap } from "#shared/rules/svg/page/primitives.ts";
import { MEMBERS_ATTRIBUTE } from "#shared/rules/svg/parts/standing.ts";
import { paintTextRuns } from "#shared/rules/svg/page/text-runs.ts";

/**
 * The group's colour on its region, the same on the page, on a tray's floor
 * and on a nested floor: the full colour of the corner brackets and the tab,
 * the faded colour of the frame, and the words on the tab. On the light ground
 * the full colour is the named colour itself (`heldTone`), its hue and chroma
 * whole, at a lightness of its own (`LIGHT_CORNER`). On the dark ground the
 * full colour is a light tone of the colour (`toned`), and the words a deep
 * shade of it. The faded frame is a light tone of the colour that keeps its
 * hue and a lively chroma.
 */
const DARK_CORNER: Held["dark"] = { lightness: 0.765, chroma: 0.95 };
/**
 * The lightness of a group's full colour on the light ground, by colour: the
 * lightest at which the words on the tab, a very light tint of the colour,
 * still reach APCA Lc 60, the level for large or bold text (the words are 15
 * units at weight 500). A colour holds less light for the same contrast in
 * some hues than in others, so the lightness differs from colour to colour
 * within a narrow band, as the faces' does. Yellow is the gold (`GOLD`).
 */
const LIGHT_CORNER: Readonly<Record<Exclude<PaletteColor, "yellow">, number>> = {
	red: 0.68,
	orange: 0.66,
	amber: 0.655,
	lime: 0.64,
	green: 0.635,
	emerald: 0.635,
	teal: 0.64,
	cyan: 0.64,
	sky: 0.645,
	blue: 0.66,
	indigo: 0.685,
	violet: 0.685,
	purple: 0.685,
	fuchsia: 0.68,
	pink: 0.665,
	rose: 0.68,
};
/**
 * The palette's yellow is the gold of the product (DESIGN.md, the One Gold
 * Rule), and a yellow group is drawn as the product draws its primary button:
 * the tab is the flat gold (`--primary`) and the words on it the gold's dark
 * ink (`--primary-foreground`), the one tab whose words are dark. Its corners
 * and frame are the gold as a mark: the named yellow is `--primary-mark`.
 */
const GOLD = { tab: token("--primary"), words: token("--primary-foreground") } as const;
const FRAME: Tone = {
	light: { lightness: 0.78, chroma: 0.875 },
	dark: { lightness: 0.47, chroma: 0.6 },
};
const WORDS: Tone = {
	light: { lightness: 0.98, chroma: 0.15 },
	dark: { lightness: 0.16, chroma: 0.2 },
};
/**
 * How thick the frame is, and the corner brackets over it, and how long each
 * arm of a bracket reaches from its corner.
 */
const FRAME_WIDTH = 3;
const BRACKET_WIDTH = 6;
const ARM = 28;
/** The tab's own rounded corner; the rounded one it shares with the region is the region's. */
const TAB_RADIUS = 8;

/**
 * How much of its row a group's caption may take from far away: set larger,
 * its words crowd the cards under it.
 */
const FAR_CAPTION_SHARE = 0.62;

/** How far a caption's tab keeps from a route that crosses its row. */
const ROUTE_ROOM = 8;

/** A group's colours: its corners', its tab's, its frame's, and the words on its tab. */
interface GroupColours {
	readonly corner: string;
	readonly tab: string;
	readonly frame: string;
	readonly words: string;
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
 * The colours one group's region is drawn in.
 * @param color The group's colour, or none for a group with no colour of its own.
 * @param palette The page's colours.
 * @returns The corners', the tab's, the frame's and the tab's words'.
 */
function groupColours(color: PaletteColor | undefined, palette: Palette): GroupColours {
	const ink = semanticInk(color) ?? palette.muted;
	// A group of no colour (one the policy no longer names) takes the deepest tone in the band.
	const lightness = color === undefined || color === "yellow" ? 0.635 : LIGHT_CORNER[color];
	const corner = heldTone(ink, {
		light: { least: lightness, most: lightness },
		dark: DARK_CORNER,
	});
	const frame = toned(ink, FRAME);
	return color === "yellow"
		? { corner: ink, tab: GOLD.tab, frame, words: GOLD.words }
		: { corner, tab: corner, frame, words: toned(ink, WORDS) };
}

/**
 * The caption on its tab, a flat shape of the group's full colour grown out of
 * the bracket of its corner, and the words on it.
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
	const { box, shift } = tabBox(region, run, corner, grown);
	return lines([
		tag("path", { d: tabPath(box, corner), fill: colours.tab }),
		paintTextRuns(
			[run],
			{ ...region.caption.box, x: region.caption.box.x + shift },
			palette,
			colours.words,
		),
	]);
}

/**
 * A rounded outline round a box, its outer edge on the box.
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
 * Four thick brackets, one round each corner of a box, their outer edge on the
 * box's and their curve its corner's, so each lies over the frame under it.
 * @param box The box.
 * @param ink Their colour.
 * @returns The brackets.
 */
function brackets(box: Box, ink: string): string {
	const inset = BRACKET_WIDTH / 2;
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
				"stroke-width": BRACKET_WIDTH,
			});
		}),
	);
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
 * Paint one group's region: its frame and its corner brackets, and its caption
 * on its tab, drawn near and from far away.
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
	const colours = groupColours(policy.groups[region.group]?.color, palette);
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
			// The region's box, unpainted, its first shape, which a reader of the
			// markup takes the region's extent from.
			tag("rect", {
				x: coord(region.box.x),
				y: coord(region.box.y),
				width: coord(region.box.width),
				height: coord(region.box.height),
				rx: BAND_RADIUS,
				fill: "none",
			}),
			outline(region.box, FRAME_WIDTH, colours.frame),
			brackets(region.box, colours.corner),
			near === undefined
				? ""
				: nearLayer(captionTab(region, near, { corner, grown: 1 }, look)) +
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
	return farLayer(captionTab(region, grown, { corner, grown: size / run.fontSize }, look));
}

export { paintRegion };
