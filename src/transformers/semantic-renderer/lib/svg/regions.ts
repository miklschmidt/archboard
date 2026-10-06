// Group regions (TASK-347): the cards one group places inside one container,
// on a mat of the group's colour with the group's name on a tab in its corner.
// The mat is a thin block like every other part (`slab.ts`): a face of the
// group's colour at a light tint over a front edge of the full colour, lying
// flat on what holds it, and the cards in it stand on it. The tab is cut from
// the same block and raised a step off the mat's corner, inside the region's
// box. It is never an obstacle: lines cross it, and it takes no pointer, so
// whatever lies inside it is picked as before.
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import {
	BAND_RADIUS,
	MAT_THICKNESS,
	TAB_THICKNESS,
} from "@/transformers/semantic-renderer/lib/design";
import type { DrawingRegion, TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { segmentStart, type Curve } from "@/transformers/semantic-renderer/lib/layout/curves";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { lightDark, mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import { farLayer, nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	GLINT_WIDTH,
	glintOf,
	slab,
	slabShadow,
	tinted,
	type Share,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import { MEMBERS_ATTRIBUTE } from "@/transformers/semantic-renderer/lib/svg/standing";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";

/**
 * How much of the group's colour the mat's face, its front edge, its tab's
 * face and its tab's edge carry. The mat's edge is the group's colour at a
 * middle lightness on either ground, a coloured foot under a quiet face; the
 * tab's edge is quieter, the thickness of a label rather than a rule under it.
 */
const MAT_FACE: Share = { light: 0.12, dark: 0.11 };
const MAT_EDGE: Share = { light: 0.8, dark: 0.45 };
const TAB_FACE: Share = { light: 0.17, dark: 0.17 };
const TAB_EDGE: Share = { light: 0.4, dark: 0.35 };
/** The tab's own corners; the one it shares with the mat is the mat's. */
const TAB_RADIUS = 8;
/** How far the caption's words lean from the group's colour toward the text colour. */
const CAPTION_DEPTH = 0.5;

/**
 * How much of its row a group's caption may take from far away: set larger,
 * its words crowd the cards under it.
 */
const FAR_CAPTION_SHARE = 0.62;

/** A group's colours: its mat's face and edge, its tab's face and edge, and its caption's words. */
interface MatColours {
	readonly face: string;
	readonly edge: string;
	readonly tab: string;
	readonly tabEdge: string;
	readonly words: string;
}

/**
 * A tab's outline: its top-left corner the mat's, its outer corners its own,
 * and square where its foot meets the mat's left edge, so the tab reads as cut
 * from the mat.
 * @param box The tab.
 * @returns Its path.
 */
function tabPath(box: Box): string {
	const { x, y, width, height } = box;
	const shared = Math.min(BAND_RADIUS, width / 2, height / 2);
	const own = Math.min(TAB_RADIUS, width / 2, height / 2);
	const right = x + width;
	const foot = y + height;
	return [
		`M${coord(x)},${coord(foot)}`,
		`V${coord(y + shared)}`,
		`A${coord(shared)},${coord(shared)} 0 0 1 ${coord(x + shared)},${coord(y)}`,
		`H${coord(right - own)}`,
		`A${coord(own)},${coord(own)} 0 0 1 ${coord(right)},${coord(y + own)}`,
		`V${coord(foot - own)}`,
		`A${coord(own)},${coord(own)} 0 0 1 ${coord(right - own)},${coord(foot)}`,
		"Z",
	].join(" ");
}

/**
 * The tab a caption is printed on, as wide as its words and their margin on
 * either side and as tall as the caption's row: a small slab of its own on the
 * mat's corner, casting a short shadow on the mat. Words grown for the far
 * view keep a margin after them grown as much.
 * @param region The region.
 * @param run The caption's words as they are set, near or far.
 * @param colours The group's colours.
 * @param palette The page's colours.
 * @param grown How much larger than near the words are set.
 * @returns The tab.
 */
function tab(
	region: DrawingRegion,
	run: TextRun,
	colours: MatColours,
	palette: Palette,
	grown = 1,
): string {
	const { box, caption } = region;
	const margin = caption.box.x + run.x - box.x;
	const width = Math.min(box.width, margin * (1 + grown) + run.width);
	const height = caption.box.y + caption.box.height - box.y;
	const whole = { x: box.x, y: box.y, width, height };
	const face = { ...whole, height: height - TAB_THICKNESS };
	const lit = { ...face, y: face.y + GLINT_WIDTH, height: face.height - GLINT_WIDTH };
	return lines([
		slabShadow(whole, TAB_RADIUS, "tab", palette),
		tag("path", { d: tabPath(whole), fill: colours.tabEdge }),
		tag("path", { d: tabPath(face), fill: glintOf(colours.tab, palette) }),
		tag("path", { d: tabPath(lit), fill: colours.tab }),
	]);
}

/**
 * The colours one group's region is drawn in.
 * @param ink The group's colour.
 * @param palette The page's colours.
 * @returns The mat's, the tab's and the caption's.
 */
function matColours(ink: string, palette: Palette): MatColours {
	return {
		face: tinted(palette.matFace, ink, MAT_FACE),
		edge: tinted(palette.matEdge, ink, MAT_EDGE),
		tab: tinted(palette.matFace, ink, TAB_FACE),
		// A tint of the face on the light ground, a shade of the edge on the dark.
		tabEdge: lightDark(
			mixed(palette.matFace, ink, TAB_EDGE.light),
			mixed(palette.matEdge, ink, TAB_EDGE.dark),
		),
		words: mixed(ink, palette.foreground, CAPTION_DEPTH),
	};
}

/**
 * Paint one group's region: its mat, and its caption on its tab, drawn near
 * and from far away. The mat's body is its first shape, in the region's box.
 * @param region The region.
 * @param look The page's colours, the vault's policy for the group's colour,
 * the size of the picture's card names from far away, and the picture's routes.
 * @param look.palette The page's colours.
 * @param look.policy The vault's policy.
 * @param look.farSize The size of the picture's card names from far away.
 * @param look.routes Every route the picture draws, which a far caption keeps clear of.
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
	const colours = matColours(ink, palette);
	const { box, caption } = region;
	const near = caption.measured.runs[0];
	return wrap(
		"g",
		{
			"data-semantic-kind": "group-region",
			"data-group": region.group,
			[MEMBERS_ATTRIBUTE]: region.members.join(" "),
			"pointer-events": "none",
		},
		lines([
			slab(
				box,
				{
					face: colours.face,
					edge: colours.edge,
					thickness: MAT_THICKNESS,
					radius: BAND_RADIUS,
					sheen: false,
				},
				palette,
			),
			nearLayer(
				(near === undefined ? "" : tab(region, near, colours, palette)) +
					paintTextRuns(caption.measured.runs, caption.box, palette, colours.words),
			),
			farCaption(region, { farSize, routes }, colours, palette),
		]),
	);
}

/** How far a far caption's tab stops short of a route that crosses its row. */
const ROUTE_ROOM = 8;

/**
 * How far right a caption's tab may reach from far away: a little short of
 * the nearest route that crosses the caption's row to the right of its near
 * words, or the region's far wall. A route that crosses the row before the
 * words end crosses the near tab too, and is the layout's to keep clear.
 * @param region The region.
 * @param words Where the caption's near words end.
 * @param routes Every route the picture draws.
 * @returns The rightmost the tab may reach.
 */
function farReach(region: DrawingRegion, words: number, routes: readonly Curve[]): number {
	const { box, caption } = region;
	const row = { top: caption.box.y, bottom: caption.box.y + caption.box.height };
	const crossings = routes.flatMap((curve) =>
		curve.segments.flatMap((segment, index) => {
			const points = [segmentStart(curve, index), segment.to];
			if (segment.kind === "cubic") points.push(segment.first, segment.second);
			const left = Math.min(...points.map(({ x }) => x));
			const crosses =
				Math.min(...points.map(({ y }) => y)) < row.bottom &&
				Math.max(...points.map(({ y }) => y)) > row.top;
			return crosses && left > words ? [left - ROUTE_ROOM] : [];
		}),
	);
	return Math.min(box.x + box.width, ...crossings);
}

/**
 * A group's caption from far away: one line as large as its row holds, up to
 * the size of the picture's card names, on a tab grown to hold it that never
 * reaches past its region's wall or into a route crossing its row
 * ({@link farReach}). It is never set smaller than near.
 * @param region The region.
 * @param far The size of the picture's card names from far away, and the picture's routes.
 * @param far.farSize The size of the picture's card names from far away.
 * @param far.routes Every route the picture draws.
 * @param colours The group's colours.
 * @param palette The page's colours.
 * @returns The far layer.
 */
function farCaption(
	region: DrawingRegion,
	{ farSize, routes }: { farSize: number; routes: readonly Curve[] },
	colours: MatColours,
	palette: Palette,
): string {
	const { box, caption } = region;
	const run = caption.measured.runs[0];
	if (run === undefined) return "";
	// The tab is the words' margin before them and as much again after them,
	// both grown with the words (`tab`): its width at a size is linear in it.
	const margin = caption.box.x + run.x - box.x;
	const reach = farReach(region, caption.box.x + run.x + run.width, routes);
	const size = Math.max(
		run.fontSize,
		Math.min(
			farSize,
			caption.box.height * FAR_CAPTION_SHARE,
			(run.fontSize * (reach - box.x - margin)) / Math.max(1, margin + run.width),
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
		tab(region, grown, colours, palette, size / run.fontSize) +
			paintTextRuns([grown], caption.box, palette, colours.words),
	);
}

export { paintRegion };
